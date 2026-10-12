# Badminton club fixtures

A static website listing every match for all of a badminton club's teams in a
season, ready for any club to fork. It's organised around teams: an Overview of every team's
next match, and a Fixtures page where you can pick one or more teams, filter
home/away, and switch between a list and a calendar. Each team can be added to
your calendar app as a subscription that updates automatically. The site has
light and dark modes and works on phones.

It's free to run (GitHub Pages + Actions), needs no server or database, and
everything a club changes lives in `data/` and `CLUB.md`. To start a site for
your club, follow [SETUP.md](SETUP.md).

**Live demo:** [Bramblewood Badminton Club](https://3dd13.github.io/bramblewood/), a production fork that tracks this repo.

<!-- club: live links (fork-owned: replace this section with your club's URLs) -->
> **Live site:** https://3dd13.github.io/bramblewood/
> Calendar feeds: `https://3dd13.github.io/bramblewood/calendar/<team>.ics` (or `all.ics`).
<!-- /club: live links -->

## Quick start

```sh
python3 -m venv .venv && .venv/bin/pip install -r requirements.txt
.venv/bin/python scripts/build.py          # check data + build into _site/
python3 -m http.server 8000 -d _site       # open http://localhost:8000
```

Then edit `data/club.yaml`, `teams.yaml`, `venues.yaml` and `fixtures.yaml`
([EDITING.md](EDITING.md)), and work through [SETUP.md](SETUP.md) to publish.

## Documents

| Document | What it covers |
|---|---|
| [SETUP.md](SETUP.md) | Setting up a fork for a new club, and pulling updates from upstream |
| [CLUB.md](CLUB.md) | This club's own rules for agents and editors (fork-owned) |
| [REQUIREMENTS.md](REQUIREMENTS.md) | What the site must do, and the constraints on it |
| [EDITING.md](EDITING.md) | How club organisers add or change fixtures and club settings |
| [DEPLOYMENT.md](DEPLOYMENT.md) | Publishing decision (build in CI, never commit `_site/`), CI/CD pipeline, repo settings, go-live checklist |
| [TESTING.md](TESTING.md) | The 8 test stages: data, unit, calendar feeds, links, UI, screenshots, accessibility, privacy |
| [AGENTS.md](AGENTS.md) | Guide for AI coding agents (Claude Code etc.) and developers |

## How it works

```
data/*.yaml ──► scripts/build.py ──► _site/ ──► GitHub Pages
 (you edit)     (checks + builds)    (HTML, JSON, .ics)
```

1. The fixtures live in `data/fixtures.yaml`, one entry per match, and the
   club's name, colours and settings in `data/club.yaml`.
2. When you push to `main`, GitHub Actions checks the data (dates, teams,
   opponents, times, duplicates), builds the site, and runs the tests: unit,
   calendar feeds, privacy guard, links, and browser tests with screenshots
   and accessibility checks.
3. If everything passes, the site is deployed to GitHub Pages. If not, the
   deploy stops and the live site stays as it was.

## Repository layout

```
data/
  club.yaml          club name, site title, calendar ID suffix, season start, colours
  fixtures.yaml      one entry per match (the file edited most often)
  teams.yaml         the club's teams: code, name, league
  venues.yaml        home venue + opponent club venues
scripts/build.py     validation + static site / .ics generation
scripts/privacy_check.py  guard against personal data and secrets
tests/               unit (pytest) + Playwright UI/visual/a11y tests, fictional test data
site/                front end (plain HTML/CSS/JS, no framework)
.github/             CI/CD workflow, screenshot-baseline workflow, Dependabot
```

## Local preview

You need Python 3.9 or later; building the site doesn't need Node (the tests
do, see below). Use the quick start above, or
`.venv/bin/python scripts/build.py --check` to check the data without building.

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
