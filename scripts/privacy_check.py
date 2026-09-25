#!/usr/bin/env python3
"""Privacy and secrets guard (TESTING.md stage 8).

Fails if the repository or the built site contains things that must never be
published (see AGENTS.md "Sensitive data"):

  1. Tracked files that look like secrets or spreadsheet exports
     (.env, keys, credential JSON, CSV/XLSX…).
  2. Email addresses or UK phone numbers in data/ or the built site.
  3. Personal-data fields in data/*.yaml (email, phone, player, captain, …).
  4. Member names, when a private blocklist is available. The list itself
     must never be committed. It is read from the PRIVACY_BLOCKLIST
     environment variable (one name per line; a GitHub Actions secret in CI)
     or from the file named by PRIVACY_BLOCKLIST_FILE.

Usage:
    python scripts/privacy_check.py [--site _site]
"""
import argparse
import fnmatch
import os
import re
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
ON_CI = os.environ.get("GITHUB_ACTIONS") == "true"

FORBIDDEN_FILES = [
    ".env", ".env.*", "*.pem", "*.key", "*.p12", "*.pfx", "id_rsa*", "*.keystore",
    "credentials*.json", "service-account*.json", "*-sa.json", "client_secret*.json", "token*.json",
    "*.csv", "*.xlsx", "*.xls", "*.ods",
]
PERSONAL_KEYS = {"email", "phone", "mobile", "player", "players", "captain", "captains",
                 "member", "members", "gender", "availability", "squad", "contact"}
EMAIL = re.compile(r"[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}")
UK_PHONE = re.compile(r"(?<![\w/])(?:\+44\s?7\d{3}|07\d{3})\s?\d{3}\s?\d{3}(?!\d)")
TEXT_SUFFIXES = {".yaml", ".yml", ".json", ".html", ".js", ".css", ".ics", ".txt", ".md", ".svg"}
# Addresses that are allowed to appear (none today; add public club contact addresses here if ever needed).
ALLOWED_EMAILS = set()

problems = []


def problem(where, msg):
    problems.append(f"{where}: {msg}")


def tracked_files():
    try:
        out = subprocess.run(["git", "ls-files", "-z"], cwd=ROOT, capture_output=True, check=True).stdout
        return [p for p in out.decode().split("\0") if p]
    except (subprocess.CalledProcessError, FileNotFoundError):
        return [str(p.relative_to(ROOT)) for p in ROOT.rglob("*") if p.is_file() and ".git" not in p.parts]


def check_forbidden_files():
    for path in tracked_files():
        name = Path(path).name
        if any(fnmatch.fnmatch(name, pat) for pat in FORBIDDEN_FILES):
            problem(path, "file type must never be committed (secret or spreadsheet export)")


def text_files(*dirs):
    for d in dirs:
        if d.is_dir():
            yield from (p for p in sorted(d.rglob("*")) if p.is_file() and p.suffix in TEXT_SUFFIXES)


def check_contact_details(files):
    for p in files:
        text = p.read_text(encoding="utf-8", errors="replace")
        for m in EMAIL.finditer(text):
            if m.group(0).lower() not in ALLOWED_EMAILS:
                problem(rel(p), "email address found")  # never echo it: CI logs are public
        if UK_PHONE.search(text):
            problem(rel(p), "phone number found")


def check_personal_keys():
    key_re = re.compile(r"^\s*-?\s*([A-Za-z_]+)\s*:", re.M)
    for p in sorted((ROOT / "data").glob("*.y*ml")):
        for m in key_re.finditer(p.read_text(encoding="utf-8")):
            if m.group(1).lower() in PERSONAL_KEYS:
                line = p.read_text(encoding="utf-8")[: m.start()].count("\n") + 1
                problem(f"{rel(p)}:{line}", f"personal-data field '{m.group(1)}' is not allowed")


def load_blocklist():
    raw = os.environ.get("PRIVACY_BLOCKLIST", "")
    path = os.environ.get("PRIVACY_BLOCKLIST_FILE")
    if path and Path(path).is_file():
        raw += "\n" + Path(path).read_text(encoding="utf-8")
    names = {n.strip() for n in raw.splitlines() if n.strip() and not n.startswith("#")}
    return sorted(names)


def check_names(files, names):
    # Whole-word, case-insensitive. Never print the matched name itself (logs are public).
    patterns = [(n, re.compile(rf"(?<![\w-]){re.escape(n)}(?![\w-])", re.I)) for n in names]
    for p in files:
        text = p.read_text(encoding="utf-8", errors="replace")
        hits = sum(1 for _, pat in patterns if pat.search(text))
        if hits:
            problem(rel(p), f"contains {hits} name(s) from the private blocklist")


def rel(p):
    try:
        return p.relative_to(ROOT).as_posix()
    except ValueError:
        return str(p)


def main():
    parser = argparse.ArgumentParser(description=__doc__.split("\n")[0])
    parser.add_argument("--site", type=Path, default=ROOT / "_site", help="built site to scan (default: _site/)")
    args = parser.parse_args()
    site = args.site.resolve()

    scan = list(text_files(ROOT / "data", site))
    check_forbidden_files()
    check_contact_details(scan)
    check_personal_keys()
    names = load_blocklist()
    if names:
        check_names(scan, names)
    else:
        print("ℹ No private name blocklist provided (PRIVACY_BLOCKLIST); skipping the name check.")

    scanned = f"data/ and {rel(site)}/" if site.is_dir() else "data/ (no built site found)"
    if problems:
        print(f"\n✗ Privacy check failed ({len(problems)} problem(s)) scanning {scanned}:\n", file=sys.stderr)
        for p in problems:
            print(f"  {p}", file=sys.stderr)
            if ON_CI:
                print(f"::error::{p}")
        print("\nSee AGENTS.md → Sensitive data.\n", file=sys.stderr)
        sys.exit(1)
    print(f"✓ Privacy check passed ({len(scan)} files in {scanned}"
          f"{f', {len(names)} blocklisted names' if names else ''})")


if __name__ == "__main__":
    main()
