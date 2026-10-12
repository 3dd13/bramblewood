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
import csv
import datetime as dt
import html
import io
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


def season_of(date, start_month):
    start = date.year if date.month >= start_month else date.year - 1
    return f"{start % 100:02d}/{(start + 1) % 100:02d}"


def slug(text):
    return re.sub(r"[^a-z0-9]+", "-", text.lower()).strip("-")


# ── Club settings ──────────────────────────────────────────────────────────
# data/club.yaml holds everything that makes this site one club's, so other
# clubs can reuse the code by editing data files only.

# section -> {key: required?}
CLUB_SCHEMA = {
    "club": {"short_name": True, "full_name": True, "website_url": False},
    "site": {"title": True, "description": True, "locale": True, "timezone": True},
    "calendar": {"uid_domain": True},
    "season": {"start_month": True},
    "branding": {"brand": True, "brand_ink": False, "brand_dark": False, "brand_ink_dark": False, "focus_dark": False},
    "bookings": {"club_night_weekday": True},
}
OPTIONAL_SECTIONS = {"branding", "bookings"}
# The original indigo theme, used for any colour club.yaml leaves out.
BRAND_DEFAULTS = {"brand": "#4f46e5", "brand_ink": "#3730a3", "brand_dark": "#8b85ff",
                  "brand_ink_dark": "#b9b5ff", "focus_dark": "#a5a0ff"}
# The calendar feeds bundle only this zone's VTIMEZONE (see VTIMEZONE below).
TIMEZONES = {"Europe/London"}
WEEKDAYS = ["monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday"]


def mapping_items(node):
    """[(key, value node, line)] of a YAML mapping."""
    return [(k.value, v, k.start_mark.line + 1) for k, v in node.value]


def read_club_sections(node):
    """{section: {key: (value, line)}}, reporting unknown, missing and misshapen entries."""
    if not isinstance(node, yaml.MappingNode):
        error("club.yaml", 1, "Expected sections like `club:`, `site:` and `calendar:`")
        return {}
    sections, lines = {}, {}
    for name, value, line in mapping_items(node):
        if name not in CLUB_SCHEMA:
            error("club.yaml", line, f"Unknown section '{name}' (allowed: {', '.join(CLUB_SCHEMA)})")
            continue
        if not isinstance(value, yaml.MappingNode):
            error("club.yaml", line, f"`{name}:` must be followed by indented `key: value` lines")
            continue
        fields = sections[name] = {}
        lines[name] = line
        for key, v, kline in mapping_items(value):
            if key not in CLUB_SCHEMA[name]:
                error("club.yaml", kline, f"Unknown setting '{key}' in `{name}:` (allowed: {', '.join(CLUB_SCHEMA[name])})")
            elif not isinstance(v, yaml.ScalarNode):
                error("club.yaml", kline, f"`{name}.{key}` must be a single value on the same line")
            else:
                fields[key] = (v.value.strip(), kline)
    for name, keys in CLUB_SCHEMA.items():
        if name not in sections:
            if name not in OPTIONAL_SECTIONS:
                error("club.yaml", None, f"Missing section `{name}:` (see data/club.yaml in the original repository for an example)")
            continue
        for key, required in keys.items():
            if required and not sections[name].get(key, ("",))[0]:
                error("club.yaml", lines[name], f"Missing `{key}` under `{name}:`")
    return sections


def read_club():
    if not (DATA / "club.yaml").exists():
        error("club.yaml", None, "File is missing. Copy data/club.yaml from the original repository and edit it")
        return None
    node = load("club.yaml")
    if node is None:
        return None
    s = read_club_sections(node)
    get = lambda section, key, default="": s.get(section, {}).get(key, (default, 1))

    url, line = get("club", "website_url")
    if url and not valid_https_url(url):
        error("club.yaml", line, f"website_url must be a full https:// link, got '{url}'")
    tz, line = get("site", "timezone")
    if tz and tz not in TIMEZONES:
        error("club.yaml", line, f"Timezone '{tz}' is not supported yet (use: {', '.join(sorted(TIMEZONES))})")
    locale, line = get("site", "locale")
    if locale and not re.fullmatch(r"[a-z]{2,3}(-[A-Za-z0-9]{2,8})*", locale):
        error("club.yaml", line, f"Bad locale '{locale}' (use a language tag like en-GB)")
    uid, line = get("calendar", "uid_domain")
    if uid and not re.fullmatch(r"[a-z0-9]+([.-][a-z0-9]+)*", uid):
        error("club.yaml", line, f"Bad uid_domain '{uid}' (use lowercase letters, digits and dashes, e.g. riverside-fixtures)")
    month, line = get("season", "start_month")
    if month and not (month.isdigit() and 1 <= int(month) <= 12):
        error("club.yaml", line, f"start_month must be a month number 1–12 (8 = August), got '{month}'")
        month = ""

    colours = {}
    for key, default in BRAND_DEFAULTS.items():
        value, line = get("branding", key, default)
        if not re.fullmatch(r"#[0-9a-fA-F]{6}", value):
            error("club.yaml", line, f"`branding.{key}` must be a colour like \"#4f46e5\" (in quotes), got '{value}'")
        colours[key] = value

    weekday = None
    if "bookings" in s:
        day, line = get("bookings", "club_night_weekday")
        if day and day.lower() not in WEEKDAYS:
            error("club.yaml", line, f"club_night_weekday must be a day name like thursday, got '{day}'")
        elif day:
            weekday = WEEKDAYS.index(day.lower())

    return {
        "short_name": get("club", "short_name")[0],
        "full_name": get("club", "full_name")[0],
        "website_url": url,
        "title": get("site", "title")[0],
        "description": get("site", "description")[0],
        "locale": locale,
        "timezone": tz,
        "uid_domain": uid,
        "season_start": int(month or 8),
        "colours": colours,
        "bookings": "bookings" in s,
        "club_night": weekday,
    }


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


def read_fixtures(teams, home, clubs, season_start):
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
            "season": season_of(date, season_start),
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


def build_ics(name, fixtures, teams_by_code, site_url, club):
    stamp = build_time().strftime("%Y%m%dT%H%M%SZ")
    lines = [
        "BEGIN:VCALENDAR",
        "VERSION:2.0",
        f"PRODID:-//{club['short_name']}//Fixtures//EN",
        "CALSCALE:GREGORIAN",
        "METHOD:PUBLISH",
        f"X-WR-CALNAME:{ics_escape(name)}",
        f"X-WR-TIMEZONE:{club['timezone']}",
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
        lines += ["BEGIN:VEVENT", f"UID:{f['id']}@{club['uid_domain']}", f"DTSTAMP:{stamp}"]
        if f["time"]:
            start = dt.datetime.combine(date, dt.time.fromisoformat(f["time"]))
            end = start + MATCH_DURATION
            lines += [f"DTSTART;TZID={club['timezone']}:{start:%Y%m%dT%H%M%S}",
                      f"DTEND;TZID={club['timezone']}:{end:%Y%m%dT%H%M%S}"]
        else:
            lines += [f"DTSTART;VALUE=DATE:{date:%Y%m%d}",
                      f"DTEND;VALUE=DATE:{date + dt.timedelta(days=1):%Y%m%d}"]
        lines += [f"SUMMARY:{ics_escape(summary)}", f"DESCRIPTION:{ics_escape(chr(10).join(desc))}"]
        if location:
            lines.append(f"LOCATION:{ics_escape(location)}")
        lines.append("END:VEVENT")
    lines.append("END:VCALENDAR")
    return "\r\n".join(ics_fold(l) for l in lines) + "\r\n"


# ── Home venue bookings (unlisted admin export) ───────────────────────────
# Written to _site/admin/ for the club admins to send to the venue manager. Never linked
# from the public pages; it holds the same home fixtures the site already shows, no personal data.

MONTHS = ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"]


def home_booking_rows(fixtures):
    """[(date, number of home matches)] for every date with at least one home match, in date order."""
    counts = {}
    for f in fixtures:
        if f["homeAway"] == "H":
            d = dt.date.fromisoformat(f["date"])
            counts[d] = counts.get(d, 0) + 1
    return sorted(counts.items())


def quarter_of(date):
    """Calendar quarter as (file slug, label), e.g. ("oct-dec-2026", "Oct–Dec 2026")."""
    first, last = MONTHS[(date.month - 1) // 3 * 3], MONTHS[(date.month - 1) // 3 * 3 + 2]
    return f"{first}-{last}-{date.year}", f"{first.title()}–{last.title()} {date.year}"


def booking_csv(rows):
    buf = io.StringIO()
    writer = csv.writer(buf)
    writer.writerow(["Date", "Day", "Matches"])
    for d, n in rows:
        writer.writerow([f"{d.day} {d:%b %Y}", f"{d:%a}", n])
    return buf.getvalue().encode("utf-8")


def write_home_bookings(fixtures, out_dir, generated, club):
    rows = home_booking_rows(fixtures)
    admin = out_dir / "admin"
    admin.mkdir()
    lists = []  # (label, file name, rows)

    by_quarter = {}
    for d, n in rows:
        by_quarter.setdefault(quarter_of(d), []).append((d, n))
    for (slug_, label), q_rows in by_quarter.items():
        lists.append((f"Home dates, {label}", f"home-bookings-{slug_}.csv", q_rows))

    # Club night: one extra list per season of the home dates on that weekday.
    by_season = {}
    for d, n in rows:
        if d.weekday() == club["club_night"]:
            by_season.setdefault(season_of(d, club["season_start"]), []).append((d, n))
    day = WEEKDAYS[club["club_night"]] + "s" if club["club_night"] is not None else ""
    for season, s_rows in by_season.items():
        lists.append((f"{day.title()} only, 20{season}", f"home-bookings-{day}-20{season.replace('/', '-')}.csv", s_rows))

    for _, name, l_rows in lists:
        (admin / name).write_bytes(booking_csv(l_rows))

    items = "\n".join(
        f'    <li><a href="{html.escape(name)}">{html.escape(label)}</a>'
        f' <span>{len(l_rows)} dates · {sum(n for _, n in l_rows)} matches</span></li>'
        for label, name, l_rows in lists) or "    <li>No home matches.</li>"
    (admin / "index.html").write_text(f"""<!doctype html>
<html lang="{html.escape(club['locale'])}">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <meta name="robots" content="noindex, nofollow">
  <title>Home venue bookings · {html.escape(club['short_name'])}</title>
  <style>
    body {{ font: 16px/1.5 system-ui, -apple-system, "Segoe UI", sans-serif; margin: 0 auto; max-width: 40rem; padding: 24px 16px; color: #161b2e; }}
    li {{ margin: 10px 0; }} span {{ color: #5b6480; }} a {{ color: {club['colours']['brand_ink']}; font-weight: 600; }}
    p {{ color: #5b6480; }}
  </style>
</head>
<body>
  <h1>Home venue bookings</h1>
  <p>Every date with a home match at {html.escape(club['short_name'])}'s venue and how many matches are on it
    (Date, Day, Matches). For the club admins and the venue manager, not linked from the public site.</p>
  <ul>
{items}
  </ul>
  <p>Last updated {generated.day} {generated:%b %Y}. Updates automatically whenever the fixtures change.</p>
</body>
</html>
""", encoding="utf-8")
    return lists


# ── Site templating ────────────────────────────────────────────────────────
# site/ files carry __PLACEHOLDERS__ for the club settings (data/club.yaml); the build
# fills them in, so the site source itself names no club and has no fixed brand colour.

def site_placeholders(club):
    c = club["colours"]
    text = {
        "__LANG__": club["locale"],
        "__SITE_TITLE__": club["title"],
        "__SITE_DESCRIPTION__": club["description"],
        "__CLUB_FULL_NAME__": club["full_name"],
        "__CLUB_SHORT_NAME__": club["short_name"],
    }
    colours = {  # validated as #rrggbb, so safe in HTML, CSS and SVG as-is
        "__BRAND_INK_DARK__": c["brand_ink_dark"],
        "__BRAND_DARK__": c["brand_dark"],
        "__BRAND_INK__": c["brand_ink"],
        "__FOCUS_DARK__": c["focus_dark"],
        "__BRAND__": c["brand"],
    }
    return {**{k: html.escape(v) for k, v in text.items()}, **colours}


def fill_placeholders(path, values):
    text = path.read_text(encoding="utf-8")
    for key, value in values.items():
        text = text.replace(key, value)
    path.write_text(text, encoding="utf-8")


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

    club = read_club()
    teams = read_teams()
    home, clubs = read_venues()
    fixtures = read_fixtures(teams, home, clubs, club["season_start"] if club else 8)

    if errors:
        report_errors()
        sys.exit(1)
    print(f"✓ Data OK: {len(fixtures)} matches, {len(teams)} teams, {len(clubs)} opponent clubs")
    if check_only:
        return

    if OUT.exists():
        shutil.rmtree(OUT)
    shutil.copytree(SITE_SRC, OUT)
    values = site_placeholders(club)
    for name in ("index.html", "style.css", "favicon.svg"):
        fill_placeholders(OUT / name, values)

    teams_by_code = {t["code"]: t for t in teams}
    (OUT / "calendar").mkdir()
    (OUT / "calendar" / "all.ics").write_text(
        build_ics(f"{club['short_name']} – all matches", fixtures, teams_by_code, site_url, club), encoding="utf-8")
    for t in teams:
        mine = [f for f in fixtures if f["team"] == t["code"]]
        (OUT / "calendar" / f"{t['slug']}.ics").write_text(
            build_ics(f"{club['short_name']} – {t['code']}", mine, teams_by_code, site_url, club), encoding="utf-8")

    bookings = write_home_bookings(fixtures, OUT, build_time(), club) if club["bookings"] else None

    payload = {
        "generated": build_time().isoformat(timespec="seconds"),
        "club": {"shortName": club["short_name"], "fullName": club["full_name"],
                 "websiteUrl": club["website_url"], "locale": club["locale"]},
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
    extra = f" (+ admin/ home booking export: {len(bookings)} lists)" if bookings is not None else ""
    print(f"✓ Built site into {rel(OUT)}/{extra}")


if __name__ == "__main__":
    main()
