# Bramblewood Badminton Club fixtures

A static website listing every match for all Bramblewood Badminton Club teams
in the 2026/27 season. You can filter by team and by home/away, switch between
a list and a calendar view, and subscribe to a calendar feed.

> **Status:** built and committed locally, **not yet published**. Deployment to
> GitHub Pages is set up (`.github/workflows/deploy.yml`) but the GitHub
> repository has not been created yet.

## Documents

| Document | What it covers |
|---|---|
| [REQUIREMENTS.md](REQUIREMENTS.md) | What the site must do, and the constraints on it |
| [EDITING.md](EDITING.md) | How club organisers add or change fixtures |
| [DEPLOYMENT.md](DEPLOYMENT.md) | Publishing decision (build in CI, never commit `_site/`), pipeline, go-live checklist |
| [TESTING.md](TESTING.md) | Test strategy incl. Playwright UI + screenshot tests (proposed) |
| [AGENTS.md](AGENTS.md) | Guide for AI coding agents (Claude Code etc.) and developers |

## How it works

```
data/*.yaml ──► scripts/build.py ──► _site/ ──► GitHub Pages
 (you edit)     (checks + builds)    (HTML, JSON, .ics)
```

1. The fixtures live in `data/fixtures.yaml`, one entry per match.
2. When you push to `main`, GitHub Actions runs `scripts/build.py`. It checks
   the data (dates, teams, opponents, times, duplicates) and builds the site.
3. If the data is valid, the site is deployed to GitHub Pages. If not, the
   deploy stops and the live site stays as it was.

## Repository layout

```
data/
  fixtures.yaml      one entry per match (the file edited most often)
  teams.yaml         Bramblewood teams: code, name, league
  venues.yaml        home venue + opponent club venues
scripts/build.py     validation + static site / .ics generation
site/                front end (plain HTML/CSS/JS, no framework)
.github/workflows/   build + deploy pipeline
```

## Local preview

You need Python 3.9 or later. Node isn't used.

```sh
python3 -m venv .venv && .venv/bin/pip install -r requirements.txt
.venv/bin/python scripts/build.py          # check data + build into _site/
python3 -m http.server 8000 -d _site       # open http://localhost:8000
```

Use `.venv/bin/python scripts/build.py --check` to check the data without building.

## Privacy and security

This site is **public**. Never add player names, contact details,
availability or any other personal data. Never commit passwords, API keys,
tokens or credential files. See the *Sensitive data* section in
[AGENTS.md](AGENTS.md#sensitive-data--read-before-changing-anything) for the full rules.
