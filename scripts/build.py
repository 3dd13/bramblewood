#!/usr/bin/env python3
"""Validate the data files and build the static site into _site/.

Usage:
    python scripts/build.py                  # validate + build
    python scripts/build.py --check          # validate only
    python scripts/build.py --data tests/data --out _site-test   # build test fixtures

Set SOURCE_DATE_EPOCH to fix the build timestamp (used for reproducible test builds).

Errors are printed with file and line numbers. On GitHub Actions they are
also emitted as annotations so they show up on the commit.
"""
import argparse
import datetime as dt
import json
import os
import re
import shutil
import sys
from pathlib import Path
from urllib.parse import urlparse

import yaml

ROOT = Path(__file__).resolve().parent.parent
DATA = ROOT / "data"  # overridden by --data
SITE_SRC = ROOT / "site"
OUT = ROOT / "_site"  # overridden by --out

CLUB_NAME = "Bramblewood"
TIMEZONE = "Europe/London"
MATCH_DURATION = dt.timedelta(hours=2, minutes=30)
ON_CI = os.environ.get("GITHUB_ACTIONS") == "true"

errors = []


def build_time():
    epoch = os.environ.get("SOURCE_DATE_EPOCH")
    if epoch:
        return dt.datetime.fromtimestamp(int(epoch), dt.timezone.utc)
    return dt.datetime.now(dt.timezone.utc)


def rel(path):
    try:
        return path.relative_to(ROOT).as_posix()
    except ValueError:
        return path.as_posix()


def error(file, line, msg):
    errors.append((file, line, msg))


# ── Loading ────────────────────────────────────────────────────────────────
# Parse into nodes rather than Python values so every scalar stays a plain
# string (no surprise date/time/number conversion) and we keep line numbers.

def to_plain(node):
    if isinstance(node, yaml.ScalarNode):
        return node.value.strip()
    if isinstance(node, yaml.SequenceNode):
        return [to_plain(n) for n in node.value]
    return {k.value: to_plain(v) for k, v in node.value}


def load(name):
    path = DATA / name
    try:
        return yaml.compose(path.read_text(encoding="utf-8"))
    except yaml.YAMLError as e:
        mark = getattr(e, "problem_mark", None)
        error(name, mark.line + 1 if mark else None, f"Invalid YAML: {getattr(e, 'problem', e)}")
        return None


def club_of(opponent):
    """'Felbridge B' -> 'Felbridge'."""
    return re.sub(r"\s+[A-Z]$", "", opponent)


def season_of(date):
    start = date.year if date.month >= 8 else date.year - 1
    return f"{start % 100:02d}/{(start + 1) % 100:02d}"


def slug(text):
    return re.sub(r"[^a-z0-9]+", "-", text.lower()).strip("-")


# ── Validation ─────────────────────────────────────────────────────────────

TEAM_FIELDS = {"code", "name", "league", "type", "division", "results_url"}


def valid_https_url(url):
    parts = urlparse(url)
    return parts.scheme == "https" and bool(parts.netloc) and " " not in url


def read_teams():
    node = load("teams.yaml")
    if node is None:
        return []
    if not isinstance(node, yaml.SequenceNode):
        error("teams.yaml", 1, "Expected a list of teams")
        return []
    teams, seen = [], set()
    for n in node.value:
        line = n.start_mark.line + 1
        t = to_plain(n) if isinstance(n, yaml.MappingNode) else {}
        code = t.get("code", "")
        if not code:
            error("teams.yaml", line, "Team is missing `code`")
            continue
        if code in seen:
            error("teams.yaml", line, f"Duplicate team code '{code}'")
        seen.add(code)
        extra = set(t) - TEAM_FIELDS
        if extra:
            error("teams.yaml", line, f"Unknown field(s) {', '.join(sorted(extra))} (allowed: {', '.join(sorted(TEAM_FIELDS))})")
        url = t.get("results_url", "")
        if url and not valid_https_url(url):
            error("teams.yaml", line, f"results_url must be a full https:// link, got '{url}'")
            url = ""
        teams.append({
            "code": code,
            "slug": slug(code),
            "name": t.get("name") or code,
            "league": t.get("league", ""),
            "type": t.get("type", ""),
            "division": t.get("division", ""),
            "resultsUrl": url,
        })
    return teams


def read_venues():
    node = load("venues.yaml")
    if node is None:
        return {}, {}
    v = to_plain(node) if isinstance(node, yaml.MappingNode) else {}
    home = v.get("home") or {}
    if not home.get("address"):
        error("venues.yaml", 1, "`home.address` is required")
    clubs = v.get("clubs") or {}
    if not isinstance(clubs, dict):
        error("venues.yaml", 1, "`clubs` must be a mapping of club name -> venue")
        clubs = {}
    for name, venue in clubs.items():
        if not isinstance(venue, dict):
            error("venues.yaml", 1, f"Club '{name}' must have `name:` and `address:` lines")
            clubs[name] = {}
            continue
        extra = set(venue) - {"name", "address", "leagues"}
        if extra:
            error("venues.yaml", 1, f"Club '{name}': unknown field(s) {', '.join(sorted(extra))} (allowed: name, address, leagues)")
        leagues = venue.get("leagues") or {}
        if not isinstance(leagues, dict) or any(not isinstance(x, dict) for x in leagues.values()):
            error("venues.yaml", 1, f"Club '{name}': `leagues:` must map a league name to its own `name:`/`address:`")
            venue["leagues"] = {}
    return home, clubs


def venue_for(club, league, clubs):
    """A club's venue, using its per-league venue when it plays elsewhere in that league."""
    venue = clubs.get(club) or {}
    return (venue.get("leagues") or {}).get(league) or venue


FIELDS = {"date", "team", "home_away", "opponent", "time", "notes", "address"}
REQUIRED = ("date", "team", "home_away", "opponent")


def read_fixtures(teams, home, clubs):
    node = load("fixtures.yaml")
    if node is None:
        return []
    if not isinstance(node, yaml.SequenceNode):
        error("fixtures.yaml", 1, "Expected a list of matches (each starting with '- date:')")
        return []
    team_codes = {t["code"] for t in teams}
    team_league = {t["code"]: t["league"] for t in teams}
    leagues = set(team_league.values())
    for name, venue in clubs.items():
        for lg in (venue.get("leagues") or {}):
            if lg not in leagues:
                error("venues.yaml", 1, f"Club '{name}': unknown league '{lg}' (leagues in teams.yaml: {', '.join(sorted(leagues))})")
    fixtures, seen = [], {}
    for n in node.value:
        line = n.start_mark.line + 1
        if not isinstance(n, yaml.MappingNode):
            error("fixtures.yaml", line, "Each match must be a set of `key: value` lines")
            continue
        f = to_plain(n)
        bad = False

        for key in f:
            if key not in FIELDS:
                error("fixtures.yaml", line, f"Unknown field '{key}' (allowed: {', '.join(sorted(FIELDS))})")
        for key in REQUIRED:
            if not f.get(key):
                error("fixtures.yaml", line, f"Missing `{key}`")
                bad = True
        if bad:
            continue

        try:
            date = dt.date.fromisoformat(f["date"])
        except ValueError:
            error("fixtures.yaml", line, f"Bad date '{f['date']}' (use YYYY-MM-DD, e.g. 2026-10-08)")
            continue

        if f["team"] not in team_codes:
            error("fixtures.yaml", line, f"Unknown team '{f['team']}' (known: {', '.join(sorted(team_codes))})")
            continue

        ha = f["home_away"].upper()
        if ha in ("HOME", "AWAY"):
            ha = ha[0]
        if ha not in ("H", "A"):
            error("fixtures.yaml", line, f"home_away must be H or A, got '{f['home_away']}'")
            continue

        time = f.get("time", "")
        if time:
            m = re.fullmatch(r"(\d{1,2})[:.](\d{2})", time)
            if not m or int(m[1]) > 23 or int(m[2]) > 59:
                error("fixtures.yaml", line, f"Bad time '{time}' (use 24-hour HH:MM, e.g. \"19:30\")")
                continue
            time = f"{int(m[1]):02d}:{m[2]}"

        club = club_of(f["opponent"])
        if club not in clubs:
            error("fixtures.yaml", line,
                  f"Unknown opponent club '{club}'. Check the spelling or add it under `clubs:` in venues.yaml")
            continue

        key = (date, f["team"])
        if key in seen:
            error("fixtures.yaml", line, f"{f['team']} already has a match on {date} (line {seen[key]})")
        seen[key] = line

        venue = home if ha == "H" else venue_for(club, team_league[f["team"]], clubs)
        address = f.get("address") or venue.get("address", "")
        fixtures.append({
            "id": f"{date.isoformat()}-{slug(f['team'])}-{slug(f['opponent'])}",
            "date": date.isoformat(),
            "season": season_of(date),
            "team": f["team"],
            "homeAway": ha,
            "opponent": f["opponent"],
            "time": time or None,
            "venueName": venue.get("name", "") if not f.get("address") else "",
            "address": address,
            "notes": f.get("notes", ""),
        })
    fixtures.sort(key=lambda x: (x["date"], x["time"] or "99:99", x["team"]))
    return fixtures


# ── iCalendar ──────────────────────────────────────────────────────────────

VTIMEZONE = """BEGIN:VTIMEZONE
TZID:Europe/London
BEGIN:DAYLIGHT
TZOFFSETFROM:+0000
TZOFFSETTO:+0100
TZNAME:BST
DTSTART:19700329T010000
RRULE:FREQ=YEARLY;BYMONTH=3;BYDAY=-1SU
END:DAYLIGHT
BEGIN:STANDARD
TZOFFSETFROM:+0100
TZOFFSETTO:+0000
TZNAME:GMT
DTSTART:19701025T020000
RRULE:FREQ=YEARLY;BYMONTH=10;BYDAY=-1SU
END:STANDARD
END:VTIMEZONE"""


def ics_escape(text):
    return (text.replace("\\", "\\\\").replace(";", "\\;")
            .replace(",", "\\,").replace("\n", "\\n"))


def ics_fold(line):
    """Fold lines longer than 75 octets as required by RFC 5545."""
    raw = line.encode("utf-8")
    if len(raw) <= 75:
        return line
    parts, cur = [], b""
    for ch in line:
        b = ch.encode("utf-8")
        if len(cur) + len(b) > (75 if not parts else 74):
            parts.append(cur.decode("utf-8"))
            cur = b""
        cur += b
    parts.append(cur.decode("utf-8"))
    return "\r\n ".join(parts)


def build_ics(name, fixtures, teams_by_code, site_url):
    stamp = build_time().strftime("%Y%m%dT%H%M%SZ")
    lines = [
        "BEGIN:VCALENDAR",
        "VERSION:2.0",
        f"PRODID:-//{CLUB_NAME}//Fixtures//EN",
        "CALSCALE:GREGORIAN",
        "METHOD:PUBLISH",
        f"X-WR-CALNAME:{ics_escape(name)}",
        f"X-WR-TIMEZONE:{TIMEZONE}",
        "REFRESH-INTERVAL;VALUE=DURATION:PT6H",
        "X-PUBLISHED-TTL:PT6H",
        *VTIMEZONE.splitlines(),
    ]
    for f in fixtures:
        date = dt.date.fromisoformat(f["date"])
        where = "Home" if f["homeAway"] == "H" else "Away"
        summary = f"{f['team']} v {f['opponent']} ({where})"
        desc = [teams_by_code[f["team"]]["name"], f"{where} match"]
        if not f["time"]:
            desc.append("Start time TBC")
        if f["notes"]:
            desc.append(f["notes"])
        if site_url:
            desc.append(site_url)
        location = ", ".join(x for x in (f["venueName"], f["address"]) if x)
        lines += ["BEGIN:VEVENT", f"UID:{f['id']}@bramblewood-fixtures", f"DTSTAMP:{stamp}"]
        if f["time"]:
            start = dt.datetime.combine(date, dt.time.fromisoformat(f["time"]))
            end = start + MATCH_DURATION
            lines += [f"DTSTART;TZID={TIMEZONE}:{start:%Y%m%dT%H%M%S}",
                      f"DTEND;TZID={TIMEZONE}:{end:%Y%m%dT%H%M%S}"]
        else:
            lines += [f"DTSTART;VALUE=DATE:{date:%Y%m%d}",
                      f"DTEND;VALUE=DATE:{date + dt.timedelta(days=1):%Y%m%d}"]
        lines += [f"SUMMARY:{ics_escape(summary)}", f"DESCRIPTION:{ics_escape(chr(10).join(desc))}"]
        if location:
            lines.append(f"LOCATION:{ics_escape(location)}")
        lines.append("END:VEVENT")
    lines.append("END:VCALENDAR")
    return "\r\n".join(ics_fold(l) for l in lines) + "\r\n"


# ── Main ───────────────────────────────────────────────────────────────────

def report_errors():
    print(f"\n✗ Found {len(errors)} problem(s) in the data files:\n", file=sys.stderr)
    for file, line, msg in errors:
        where = f"{rel(DATA)}/{file}" + (f":{line}" if line else "")
        print(f"  {where}  {msg}", file=sys.stderr)
        if ON_CI:
            loc = f"file={rel(DATA)}/{file}" + (f",line={line}" if line else "")
            print(f"::error {loc}::{msg}")
    print(file=sys.stderr)


def main():
    global DATA, OUT
    parser = argparse.ArgumentParser(description="Validate fixture data and build the site.")
    parser.add_argument("--check", action="store_true", help="validate only, don't build")
    parser.add_argument("--data", type=Path, default=DATA, help="data directory (default: data/)")
    parser.add_argument("--out", type=Path, default=OUT, help="output directory (default: _site/)")
    args = parser.parse_args()
    DATA, OUT = args.data.resolve(), args.out.resolve()
    check_only = args.check
    site_url = os.environ.get("SITE_URL", "").rstrip("/")

    teams = read_teams()
    home, clubs = read_venues()
    fixtures = read_fixtures(teams, home, clubs)

    if errors:
        report_errors()
        sys.exit(1)
    print(f"✓ Data OK: {len(fixtures)} matches, {len(teams)} teams, {len(clubs)} opponent clubs")
    if check_only:
        return

    if OUT.exists():
        shutil.rmtree(OUT)
    shutil.copytree(SITE_SRC, OUT)

    teams_by_code = {t["code"]: t for t in teams}
    (OUT / "calendar").mkdir()
    (OUT / "calendar" / "all.ics").write_text(
        build_ics(f"{CLUB_NAME} – all matches", fixtures, teams_by_code, site_url), encoding="utf-8")
    for t in teams:
        mine = [f for f in fixtures if f["team"] == t["code"]]
        (OUT / "calendar" / f"{t['slug']}.ics").write_text(
            build_ics(f"{CLUB_NAME} – {t['code']}", mine, teams_by_code, site_url), encoding="utf-8")

    payload = {
        "generated": build_time().isoformat(timespec="seconds"),
        "home": home,
        "teams": teams,
        "fixtures": fixtures,
    }
    data_json = json.dumps(payload, ensure_ascii=False, separators=(",", ":"))
    (OUT / "fixtures.json").write_text(data_json, encoding="utf-8")
    index = OUT / "index.html"
    # Escape "</" so the JSON can't close the <script> tag early.
    index.write_text(index.read_text(encoding="utf-8")
                     .replace("__FIXTURES_JSON__", data_json.replace("</", "<\\/")), encoding="utf-8")
    (OUT / ".nojekyll").touch()
    print(f"✓ Built site into {rel(OUT)}/")


if __name__ == "__main__":
    main()
