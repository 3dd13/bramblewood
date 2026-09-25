"""Tests for scripts/privacy_check.py. Uses only fictional names and contact details."""
import os
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
CHECK = ROOT / "scripts" / "privacy_check.py"


def run(site, blocklist=""):
    env = {k: v for k, v in os.environ.items() if not k.startswith("PRIVACY_BLOCKLIST")}
    env["PRIVACY_BLOCKLIST"] = blocklist
    return subprocess.run([sys.executable, str(CHECK), "--site", str(site)], capture_output=True, text=True, env=env)


def site_with(tmp_path, html):
    d = tmp_path / "site"
    d.mkdir()
    (d / "index.html").write_text(html, encoding="utf-8")
    return d


def test_clean_site_passes(tmp_path):
    res = run(site_with(tmp_path, "<p>AA Mens v Riverside A, 8pm</p>"), "Zebedee Testperson")
    assert res.returncode == 0, res.stderr


def test_email_and_phone_are_caught_without_echoing_them(tmp_path):
    res = run(site_with(tmp_path, "<p>Call 07700 900123 or mail quux@example.org</p>"))
    assert res.returncode == 1
    assert "email address found" in res.stderr and "phone number found" in res.stderr
    assert "quux" not in res.stdout + res.stderr and "07700" not in res.stdout + res.stderr


def test_blocklisted_name_is_caught_without_echoing_it(tmp_path):
    res = run(site_with(tmp_path, "<p>Captain: Zebedee</p>"), "Zebedee\nQuentina")
    assert res.returncode == 1
    assert "1 name(s) from the private blocklist" in res.stderr
    assert "Zebedee" not in res.stdout + res.stderr


def test_names_match_whole_words_only(tmp_path):
    res = run(site_with(tmp_path, "<p>v Zebedeeson Club</p>"), "Zebedee")
    assert res.returncode == 0, res.stderr


def test_missing_blocklist_is_reported_but_not_fatal(tmp_path):
    res = run(site_with(tmp_path, "<p>ok</p>"))
    assert res.returncode == 0
    assert "skipping the name check" in res.stdout


def test_repository_is_clean():
    """The real repo + data must pass (forbidden files, personal fields, contact details)."""
    res = run(ROOT / "does-not-exist")
    assert res.returncode == 0, res.stderr
