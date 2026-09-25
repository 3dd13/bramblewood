# Bramblewood Badminton Club fixtures

A static website listing every match for all Bramblewood Badminton Club teams
in the 2026/27 season. It's organised around teams: an Overview of every team's
next match, and a Fixtures page where you can pick one or more teams, filter
home/away, and switch between a list and a calendar. Each team can be added to
your calendar app as a subscription that updates automatically. The site has
light and dark modes and works on phones.

> **Status:** built and committed locally, **not yet published**. The CI/CD
> pipeline (`.github/workflows/ci.yml`) is ready, but the GitHub repository
> hasn't been created yet (see DEPLOYMENT.md §4).

## Documents

| Document | What it covers |
|---|---|
| [REQUIREMENTS.md](REQUIREMENTS.md) | What the site must do, and the constraints on it |
| [EDITING.md](EDITING.md) | How club organisers add or change fixtures |
| [DEPLOYMENT.md](DEPLOYMENT.md) | Publishing decision (build in CI, never commit `_site/`), CI/CD pipeline, repo settings, go-live checklist |
| [TESTING.md](TESTING.md) | The 8 test stages: data, unit, calendar feeds, links, UI, screenshots, accessibility, privacy |
| [AGENTS.md](AGENTS.md) | Guide for AI coding agents (Claude Code etc.) and developers |

## How it works

```
data/*.yaml ──► scripts/build.py ──► _site/ ──► GitHub Pages
 (you edit)     (checks + builds)    (HTML, JSON, .ics)
```

1. The fixtures live in `data/fixtures.yaml`, one entry per match.
2. When you push to `main`, GitHub Actions checks the data (dates, teams,
   opponents, times, duplicates), builds the site, and runs the tests: unit,
   calendar feeds, privacy guard, links, and browser tests with screenshots
   and accessibility checks.
3. If everything passes, the site is deployed to GitHub Pages. If not, the
   deploy stops and the live site stays as it was.

## Repository layout

```
data/
  fixtures.yaml      one entry per match (the file edited most often)
  teams.yaml         Bramblewood teams: code, name, league
  venues.yaml        home venue + opponent club venues
scripts/build.py     validation + static site / .ics generation
scripts/privacy_check.py  guard against personal data and secrets
tests/               unit (pytest) + Playwright UI/visual/a11y tests, fictional test data
site/                front end (plain HTML/CSS/JS, no framework)
.github/             CI/CD workflow, screenshot-baseline workflow, Dependabot
```

## Local preview

You need Python 3.9 or later. Building the site doesn't need Node. The tests do (see below).

```sh
python3 -m venv .venv && .venv/bin/pip install -r requirements.txt
.venv/bin/python scripts/build.py          # check data + build into _site/
python3 -m http.server 8000 -d _site       # open http://localhost:8000
```

Use `.venv/bin/python scripts/build.py --check` to check the data without building.

## Tests

Node is needed for the browser tests only, not for building the site. See [TESTING.md](TESTING.md).

```sh
.venv/bin/pip install -r requirements-dev.txt && .venv/bin/python -m pytest   # unit tests
npm install && npx playwright install chromium && npm run test:e2e           # browser tests
```

## Privacy and security

This site is **public**. Never add player names, contact details,
availability or any other personal data. Never commit passwords, API keys,
tokens or credential files. See the *Sensitive data* section in
[AGENTS.md](AGENTS.md#sensitive-data--read-before-changing-anything) for the full rules.
