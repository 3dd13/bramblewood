"""Unit tests for scripts/build.py: validation rules, helpers, output and iCalendar feeds.

Run: .venv/bin/python -m pytest
"""
import datetime as dt
import importlib.util
import json
import os
import shutil
import subprocess
import sys
from pathlib import Path

import pytest
from icalendar import Calendar

ROOT = Path(__file__).resolve().parents[2]
BUILD = ROOT / "scripts" / "build.py"
TEST_DATA = ROOT / "tests" / "data"
EPOCH = "1790000000"

spec = importlib.util.spec_from_file_location("build", BUILD)
build = importlib.util.module_from_spec(spec)
spec.loader.exec_module(build)


# ── Helpers ────────────────────────────────────────────────────────────────

def run_build(data_dir, out_dir=None, check=False, env=None):
    args = [sys.executable, str(BUILD), "--data", str(data_dir)]
    if out_dir:
        args += ["--out", str(out_dir)]
    if check:
        args.append("--check")
    return subprocess.run(args, capture_output=True, text=True,
                          env={**os.environ, "SOURCE_DATE_EPOCH": EPOCH, **(env or {})})


@pytest.fixture
def data_dir(tmp_path):
    """A writable copy of the fictional test data."""
    d = tmp_path / "data"
    shutil.copytree(TEST_DATA, d)
    return d


def add_fixture(data_dir, text):
    with open(data_dir / "fixtures.yaml", "a", encoding="utf-8") as f:
        f.write("\n" + text.strip("\n") + "\n")


@pytest.fixture(scope="module")
def built_site(tmp_path_factory):
    out = tmp_path_factory.mktemp("site")
    res = run_build(TEST_DATA, out)
    assert res.returncode == 0, res.stderr
    return out


# ── Pure helpers ───────────────────────────────────────────────────────────

@pytest.mark.parametrize("opponent,club", [
    ("Felbridge B", "Felbridge"), ("Brighton A", "Brighton"), ("Horsham", "Horsham"),
    ("AIT C", "AIT"), ("BATS", "BATS"), ("Tunbridge Wells", "Tunbridge Wells"),
])
def test_club_of(opponent, club):
    assert build.club_of(opponent) == club


@pytest.mark.parametrize("date,season", [
    ("2026-08-01", "26/27"), ("2026-10-08", "26/27"), ("2027-05-28", "26/27"),
    ("2027-07-31", "26/27"), ("2027-08-01", "27/28"), ("2099-12-31", "99/00"),
])
def test_season_of(date, season):
    assert build.season_of(dt.date.fromisoformat(date)) == season


def test_slug():
    assert build.slug("TW Mens 6") == "tw-mens-6"
    assert build.slug("Felbridge B") == "felbridge-b"


def test_ics_escape():
    assert build.ics_escape("a,b;c\\d\ne") == "a\\,b\\;c\\\\d\\ne"


@pytest.mark.parametrize("text", ["x" * 200, "é" * 120, "SUMMARY:" + "🏸 v Brighton, " * 12])
def test_ics_fold_limits_octets_and_roundtrips(text):
    folded = build.ics_fold(text)
    for line in folded.split("\r\n"):
        assert len(line.encode("utf-8")) <= 75
    assert folded.replace("\r\n ", "") == text


def test_build_time_respects_source_date_epoch(monkeypatch):
    monkeypatch.setenv("SOURCE_DATE_EPOCH", EPOCH)
    assert build.build_time() == dt.datetime.fromtimestamp(int(EPOCH), dt.timezone.utc)


# ── Validation (end to end through the CLI) ────────────────────────────────

def test_test_data_is_valid(data_dir):
    res = run_build(data_dir, check=True)
    assert res.returncode == 0, res.stderr
    assert "14 matches" in res.stdout


def test_real_data_is_valid():
    res = run_build(ROOT / "data", check=True)
    assert res.returncode == 0, res.stderr


@pytest.mark.parametrize("entry,message", [
    ("- date: 2027-02-30\n  team: AA Mens\n  home_away: H\n  opponent: Meadow", "Bad date '2027-02-30'"),
    ("- date: 2027-02-01\n  team: AA Men\n  home_away: H\n  opponent: Meadow", "Unknown team 'AA Men'"),
    ("- date: 2027-02-01\n  team: AA Mens\n  home_away: X\n  opponent: Meadow", "home_away must be H or A"),
    ("- date: 2027-02-01\n  team: AA Mens\n  home_away: H\n  opponent: Meadow\n  time: 8pm", "Bad time '8pm'"),
    ("- date: 2027-02-01\n  team: AA Mens\n  home_away: H\n  opponent: Meadow\n  time: \"24:00\"", "Bad time '24:00'"),
    ("- date: 2027-02-01\n  team: AA Mens\n  home_away: H\n  opponent: Medow", "Unknown opponent club 'Medow'"),
    ("- date: 2027-02-01\n  team: AA Mens\n  home_away: H\n  opponent: Meadow\n  tme: \"20:00\"", "Unknown field 'tme'"),
    ("- date: 2027-02-01\n  team: AA Mens\n  opponent: Meadow", "Missing `home_away`"),
    ("- date: 2026-10-08\n  team: AA Mens\n  home_away: A\n  opponent: Hilltop", "AA Mens already has a match on 2026-10-08"),
    ("- just a string", "Each match must be a set of `key: value` lines"),
])
def test_invalid_fixture_is_rejected_with_line_number(data_dir, entry, message):
    add_fixture(data_dir, entry)
    res = run_build(data_dir, check=True)
    assert res.returncode == 1
    assert message in res.stderr
    assert "fixtures.yaml:" in res.stderr  # every error points at a line


def test_invalid_yaml_is_reported(data_dir):
    add_fixture(data_dir, "- date: [unclosed")
    res = run_build(data_dir, check=True)
    assert res.returncode == 1
    assert "Invalid YAML" in res.stderr


def test_home_away_words_and_loose_times_are_normalised(data_dir, tmp_path):
    add_fixture(data_dir, "- date: 2027-02-01\n  team: AA Mens\n  home_away: away\n  opponent: Meadow\n  time: 7.30")
    res = run_build(data_dir, tmp_path / "out")
    assert res.returncode == 0, res.stderr
    fx = json.loads((tmp_path / "out" / "fixtures.json").read_text())["fixtures"]
    added = next(f for f in fx if f["date"] == "2027-02-01")
    assert added["homeAway"] == "A" and added["time"] == "07:30"


def test_github_annotations_on_ci(data_dir):
    add_fixture(data_dir, "- date: 2027-02-30\n  team: AA Mens\n  home_away: H\n  opponent: Meadow")
    res = run_build(data_dir, check=True, env={"GITHUB_ACTIONS": "true"})
    assert "::error file=" in res.stdout and ",line=" in res.stdout


# ── Build output ───────────────────────────────────────────────────────────

def test_output_files(built_site):
    for rel in ["index.html", "app.js", "style.css", "fixtures.json", "calendar/all.ics"]:
        assert (built_site / rel).is_file(), rel
    html = (built_site / "index.html").read_text()
    assert "__FIXTURES_JSON__" not in html


def test_fixtures_json_shape_and_order(built_site):
    data = json.loads((built_site / "fixtures.json").read_text())
    assert data["generated"].startswith("2026-09-21")  # from SOURCE_DATE_EPOCH
    fx = data["fixtures"]
    assert len(fx) == 14
    assert [f["date"] for f in fx] == sorted(f["date"] for f in fx)
    assert len({f["id"] for f in fx}) == len(fx)
    by_id = {f["id"]: f for f in fx}
    home = by_id["2026-10-08-aa-mens-riverside-a"]
    assert home["venueName"] == "Testtown Sports Hall" and home["season"] == "26/27"
    assert by_id["2026-11-30-aa-mens-oakfield"]["address"] == ""        # venue TBC
    assert by_id["2027-01-15-dd-combi-meadow"]["time"] is None          # time TBC
    assert by_id["2026-12-11-cc-ladies-hilltop"]["notes"] == "Rearranged from 27 Nov"


def test_json_inlined_safely(built_site):
    html = (built_site / "index.html").read_text()
    start = html.index('id="fixtures-data"')
    block = html[start:html.index("</script>", start)]
    assert "</" not in block.split(">", 1)[1]  # nothing can close the <script> early


def test_build_is_reproducible(tmp_path):
    a, b = tmp_path / "a", tmp_path / "b"
    assert run_build(TEST_DATA, a).returncode == 0
    assert run_build(TEST_DATA, b).returncode == 0
    for f in ["index.html", "fixtures.json", "calendar/all.ics", "calendar/aa-mens.ics"]:
        assert (a / f).read_bytes() == (b / f).read_bytes(), f


# ── iCalendar feeds (validated with the icalendar library) ─────────────────

def load_cal(path):
    raw = path.read_bytes()
    assert b"\r\n" in raw and b"\n" not in raw.replace(b"\r\n", b""), "lines must end with CRLF"
    for line in raw.split(b"\r\n"):
        assert len(line) <= 75, f"unfolded line: {line[:40]!r}"
    return Calendar.from_ical(raw)


def events(cal):
    return [c for c in cal.walk("VEVENT")]


def test_feeds_parse_and_have_required_properties(built_site):
    teams = json.loads((built_site / "fixtures.json").read_text())["teams"]
    for slug in ["all"] + [t["slug"] for t in teams]:
        cal = load_cal(built_site / "calendar" / f"{slug}.ics")
        assert cal.get("VERSION") == "2.0"
        assert cal.get("PRODID")
        assert cal.walk("VTIMEZONE"), slug
        for ev in events(cal):
            for prop in ("UID", "DTSTAMP", "DTSTART", "DTEND", "SUMMARY"):
                assert ev.get(prop) is not None, (slug, prop)


def test_feed_event_counts_match_fixtures(built_site):
    data = json.loads((built_site / "fixtures.json").read_text())
    assert len(events(load_cal(built_site / "calendar" / "all.ics"))) == len(data["fixtures"])
    for t in data["teams"]:
        expected = sum(f["team"] == t["code"] for f in data["fixtures"])
        assert len(events(load_cal(built_site / "calendar" / f"{t['slug']}.ics"))) == expected, t["code"]


def test_timed_and_all_day_events(built_site):
    evs = {str(e["UID"]): e for e in events(load_cal(built_site / "calendar" / "all.ics"))}
    timed = evs["2026-11-17-aa-mens-hilltop@bramblewood-fixtures"]
    start, end = timed.decoded("DTSTART"), timed.decoded("DTEND")
    assert str(start.tzinfo) in ("Europe/London", "GMT", "BST") or "London" in str(start.tzinfo)
    assert (start.hour, start.minute) == (19, 30)
    assert end - start == dt.timedelta(hours=2, minutes=30)
    assert "Hilltop School" in str(timed["LOCATION"])
    assert str(timed["SUMMARY"]) == "AA Mens v Hilltop (Away)"

    all_day = evs["2027-01-15-dd-combi-meadow@bramblewood-fixtures"]
    assert all_day.decoded("DTSTART") == dt.date(2027, 1, 15)
    assert "Start time TBC" in str(all_day["DESCRIPTION"])


def test_bst_and_gmt_offsets(built_site):
    evs = {str(e["UID"]): e for e in events(load_cal(built_site / "calendar" / "all.ics"))}
    oct_bst = evs["2026-10-08-aa-mens-riverside-a@bramblewood-fixtures"].decoded("DTSTART")
    nov_gmt = evs["2026-11-17-aa-mens-hilltop@bramblewood-fixtures"].decoded("DTSTART")
    assert oct_bst.utcoffset() == dt.timedelta(hours=1)
    assert nov_gmt.utcoffset() == dt.timedelta(0)


def test_uids_are_stable_across_builds(tmp_path):
    uids = []
    for name in ("x", "y"):
        assert run_build(TEST_DATA, tmp_path / name, env={"SOURCE_DATE_EPOCH": "1800000000" if name == "y" else EPOCH}).returncode == 0
        uids.append(sorted(str(e["UID"]) for e in events(load_cal(tmp_path / name / "calendar" / "all.ics"))))
    assert uids[0] == uids[1]


# ── Per-league venues ──────────────────────────────────────────────────────

def set_venues(data_dir, clubs_yaml):
    text = (data_dir / "venues.yaml").read_text(encoding="utf-8")
    head = text[: text.index("clubs:")]
    (data_dir / "venues.yaml").write_text(head + "clubs:\n" + clubs_yaml, encoding="utf-8")


BASE_CLUBS = """  Riverside:
    name: Riverside Leisure Centre
    address: 2 River Lane, Rivertown RT2 2BB
  Meadow:
    name: Meadow Hall
    address: 4 Meadow Way, Fieldham FH4 4DD
  Oakfield:
    name: ""
    address: ""
"""


def test_club_uses_its_league_specific_venue(data_dir, tmp_path):
    # Hilltop hosts AA Mens (Test League North) and CC Ladies (South) at different venues.
    set_venues(data_dir, BASE_CLUBS + """  Hilltop:
    name: Hilltop School
    address: 3 Hill Street, Hillville HV3 3CC
    leagues:
      Test League North:
        name: Hilltop Sports Centre
        address: 9 Summit Road, Hillville HV3 9ZZ
""")
    res = run_build(data_dir, tmp_path / "out")
    assert res.returncode == 0, res.stderr
    fx = {f["id"]: f for f in json.loads((tmp_path / "out" / "fixtures.json").read_text())["fixtures"]}
    north = fx["2026-11-17-aa-mens-hilltop"]            # AA Mens, Test League North, away
    assert (north["venueName"], north["address"]) == ("Hilltop Sports Centre", "9 Summit Road, Hillville HV3 9ZZ")
    bravo = fx["2026-10-16-bb-mixed-hilltop"]            # BB Mixed is also North
    assert bravo["venueName"] == "Hilltop Sports Centre"


def test_league_override_falls_back_to_club_venue(data_dir, tmp_path):
    set_venues(data_dir, BASE_CLUBS + """  Hilltop:
    name: Hilltop School
    address: 3 Hill Street, Hillville HV3 3CC
    leagues:
      Test League South:
        name: Hilltop Annexe
        address: 1 Annexe Row, Hillville HV3 1AA
""")
    res = run_build(data_dir, tmp_path / "out")
    assert res.returncode == 0, res.stderr
    fx = {f["id"]: f for f in json.loads((tmp_path / "out" / "fixtures.json").read_text())["fixtures"]}
    assert fx["2026-11-17-aa-mens-hilltop"]["venueName"] == "Hilltop School"   # North → default


@pytest.mark.parametrize("clubs,message", [
    ("  Hilltop:\n    name: X\n    address: Y\n    leagues:\n      No Such League:\n        name: Z\n        address: W\n", "unknown league 'No Such League'"),
    ("  Hilltop:\n    name: X\n    adress: Y\n", "unknown field(s) adress"),
    ("  Hilltop: Hilltop School\n", "must have `name:` and `address:` lines"),
])
def test_invalid_venue_entries_are_rejected(data_dir, clubs, message):
    set_venues(data_dir, BASE_CLUBS + clubs)
    res = run_build(data_dir, check=True)
    assert res.returncode == 1
    assert message in res.stderr
