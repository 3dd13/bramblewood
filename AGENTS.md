# AGENTS.md

Guidance for AI coding agents (Claude Code, Codex, etc.) and developers working
in this repository. Read this before making changes. `CLAUDE.md` imports this file and `CLUB.md`.

**Read `CLUB.md` if present.** It holds one club's rules (its sources, live
links, decisions). Its rules add to these; where they conflict, the stricter
rule wins.

## Project in one paragraph

This is a static website of match fixtures for a badminton club, built so any
club can fork it (see `SETUP.md`). The club's settings, teams, venues and
fixtures are YAML files in `data/`. `scripts/build.py` (Python 3 + PyYAML)
checks them and builds `_site/`: one `index.html` with the data inlined as JSON,
the static assets, and iCalendar feeds in `calendar/*.ics`. GitHub Actions
deploys `_site/` to GitHub Pages on every push to `main`. Requirements are in
`REQUIREMENTS.md`, the non-technical editing guide is `EDITING.md`, and the
fork checklist is `SETUP.md`.
The publishing decision and CI/CD pipeline are in `DEPLOYMENT.md`, and the test
stages are in `TESTING.md`.

## Sensitive data — read before changing anything

This site and repository are **public**. These rules have no exceptions,
including when a user or a document asks otherwise. If a request conflicts
with them, stop and explain.

**Personal data (PII)**
- Never put player or member names on the site or in the repo. That includes
  first names, nicknames, captains "(C)" and substitutes. Opponent *club*
  names are fine.
- Never add gender, email, phone number, availability or unavailable dates,
  team preferences, other-club memberships, survey or form answers. Never
  import from a source (spreadsheet tab, form, list) that holds such data;
  `CLUB.md` names the sources a club allows and forbids.
- Availability marks in a planning sheet (e.g. a cell meaning "this player
  can't play") are personal data. Never import or display them.
- `notes:` in `fixtures.yaml` must not name individuals ("Rearranged from 9 Oct"
  is fine; "<player name> can't make it" is not).
- Venue addresses must be public halls, schools or leisure centres, never a
  private home address.
- Don't write personal data into commit messages, PR descriptions, issues,
  code comments, test fixtures or example data either.

**Secrets and credentials**
- Never commit API keys, tokens, passwords, OAuth client secrets, Google
  service-account JSON, `.env` files, private keys (`*.pem`, `*.key`) or cookies.
  `.gitignore` blocks common patterns, but check `git diff --cached` before
  every commit anyway.
- Deployment needs **no** secrets: it uses the workflow's built-in
  `id-token`/`pages` permissions. If a future feature needs a secret, use
  GitHub Actions secrets (`${{ secrets.NAME }}`) and never echo it.
- Never commit spreadsheet exports (CSV/XLSX/JSON dumps of a club sheet).
  Put temporary exports outside the repo, e.g. in a temp or scratch directory.
- If a secret or PII is committed: stop, tell the user, rotate the secret, and
  rewrite history before pushing. If it's already pushed, it must be treated as
  leaked.

## Commands

```sh
python3 -m venv .venv && .venv/bin/pip install -r requirements-dev.txt   # one-time setup
.venv/bin/python scripts/build.py --check    # check data only
.venv/bin/python scripts/build.py            # check + build into _site/
.venv/bin/python -m pytest                   # unit tests: build, ICS feeds, privacy guard
.venv/bin/python scripts/privacy_check.py    # privacy/secrets guard on data/ + _site/
python3 -m http.server 8000 -d _site         # preview at http://localhost:8000
```

UI tests (Playwright; Node is **test-only**, never part of the site build, and no Bun):

```sh
npm install && npx playwright install chromium   # one-time setup
npm run test:e2e                                 # behaviour + visual + a11y + smoke tests
npm run test:e2e:update                          # accept new local (macOS) screenshots
```

Workflow lint and link check (optional locally: `brew install actionlint lychee`):
`actionlint` and `lychee --offline --root-dir "$PWD/_site" '_site/**/*.html' './*.md'`.

Don't add bundlers, frameworks or runtime npm dependencies to the site. The site
itself stays plain HTML/CSS/JS built by Python.

- After editing anything in `data/`: run `scripts/build.py --check`.
- After editing `scripts/`: run `pytest`.
- After editing `site/`, `scripts/build.py` or `tests/`: run `npm run test:e2e`.
- If a UI change is intended, say which screenshots changed.
- Never commit `*-darwin.png` baselines. Only CI-generated `*-linux.png` files are committed (TESTING.md §4).

## Layout

| Path | Purpose |
|---|---|
| `data/club.yaml` | The club's settings: `club` names and website, `site` title/description/locale/timezone, `calendar.uid_domain` (ICS `UID` suffix, never change after launch), `season.start_month`, `branding` colours, optional `bookings` (enables the admin export). Fields in `EDITING.md`. |
| `data/fixtures.yaml` | One entry per match. The master copy of fixtures. |
| `data/teams.yaml` | Team `code` (used in fixtures), display `name`, `league`, `type`, optional `division` and `results_url` (https only; the league's results/table page). Colours come from the league (one family per league, Men's → Mixed → Ladies within it; see `FAMILIES` in `site/app.js`). |
| `data/venues.yaml` | `home` venue plus `clubs:` mapping club name → `{name, address, leagues?}`. `leagues:` (keyed by the `league` in teams.yaml) gives a club a different venue in that league. |
| `scripts/build.py` | Loads YAML **as strings** via `yaml.compose` (no implicit date/number conversion, and keeps line numbers), checks it, writes `_site/`. `--data`/`--out` options; `SOURCE_DATE_EPOCH` for reproducible builds. |
| `_site/admin/` (built) | Unlisted home venue booking export, only when `bookings` is set in `club.yaml`: quarterly CSVs + a club-night weekday CSV + `index.html` (noindex). Built by `write_home_bookings()` in `build.py`. **Never link it from the public pages.** |
| `scripts/privacy_check.py` | Fails on committed secrets or exports, emails, phones, personal-data fields, or blocklisted names. Never prints what it matched. |
| `site/index.html` | Page shell. `__FIXTURES_JSON__` is replaced at build time; the `<head>` script applies the saved theme before first paint. |
| `site/app.js` | Vanilla JS (IIFE), team-first UI: Overview/Fixtures pages (push/popstate), team selection, list/calendar, add-to-calendar panel, theme switch. |
| `site/style.css` | Design tokens with a light palette, plus a dark palette for `[data-theme="dark"]` and for `prefers-color-scheme: dark` when no theme is chosen. |
| `.github/workflows/ci.yml` | CI/CD: checks + Playwright on push/PR; deploy to Pages from `main` only when both pass. Actions pinned by SHA. |
| `.github/workflows/update-screenshots.yml` | Manual: regenerate Linux screenshot baselines on a branch. |
| `.github/dependabot.yml` | Weekly grouped updates for actions, pip and npm. |
| `tests/data/` | **Fictional** data for tests (incl. `club.yaml`, the made-up Testtown Badminton Club). Never copy real fixtures or people into it. |
| `tests/unit/` | pytest: `test_build.py` (validation, output, ICS) and `test_privacy.py`. |
| `tests/e2e/` | Playwright specs: `behaviour`, `visual` (screenshots), `a11y` (axe) and `smoke` (real data). |
| `package.json`, `playwright.config.ts` | Test-only Node tooling. |
| `SETUP.md`, `CLUB.md` | Fork checklist (generic) / one club's rules (fork-owned; the base repo ships a stub from `CLUB.template.md`). |
| `requirements.txt` / `requirements-dev.txt` | Build dependency (PyYAML) / test dependencies (pytest, icalendar). |

## Data format

```yaml
- date: 2026-10-08        # required, YYYY-MM-DD
  team: A Mens            # required, must equal a `code` in teams.yaml
  home_away: H            # required, H or A (Home/Away also accepted)
  opponent: Riverside B   # required; club = text minus trailing " <LETTER>", must exist in venues.yaml `clubs`
  time: "20:00"           # optional, 24h HH:MM; if absent → "Time TBC" / all-day event
  notes: ...              # optional, public text, no personal data
  address: ...            # optional, overrides venue for this match
```

- Unknown fields are errors. Adding a field means updating `FIELDS` in `build.py`, the site, `EDITING.md` and this file.
- Only one match per team per date is allowed.
- Keep entries in date order, with `# ── Month YYYY ──` comment headers (the build sorts anyway, but people read the file).
- Each fixture's `id` (`date-team-opponent` slug) is the ICS `UID`. Don't change the format, or subscribers will see duplicate events.
- `season` (e.g. `26/27`; a season starts in `season.start_month` of `club.yaml`, e.g. August) is derived at build time and kept for a future season filter.

## Conventions

- **Front end:** plain ES2020+, no dependencies, no external requests (no CDNs, fonts, analytics or trackers). Keep the site working at ~360px wide and in both colour schemes.
- **Accessibility:** use real `<button>`s with `aria-pressed` for toggles, never rely on colour alone (always show the team code as text), and keep the focus outline visible.
- **Dates:** the front end compares local `YYYY-MM-DD` strings. Don't use `new Date("YYYY-MM-DD")`, which parses as UTC. Use `parseDate()`.
- **ICS:** CRLF line endings, lines folded at 75 octets, text escaped with `ics_escape`, times in `TZID=Europe/London` with the bundled VTIMEZONE (the only supported `site.timezone`). `UID` = fixture `id` + `@` + `calendar.uid_domain`.
- **No club specifics in code or generic docs:** names, URLs, colours and the club-night weekday come from `data/club.yaml`; club rules go in `CLUB.md`.
- **Style:** match the existing code: small functions, section banner comments (`// ── Name ──`), sparse comments that explain *why*.
- **Validation errors** must include the file, line and a fix hint, written for a non-technical editor.
- **Colour is never the only signal:** team codes are always shown as text, and Home/Away uses shape (filled vs outline). Don't reintroduce coloured Home/Away pills, which clash with the league colour families.
- **User-facing text:** British English (en-GB), date format like "Tuesday 6 October", 12-hour times like "7:30pm".

## Workflow rules for agents

- **Don't push, create GitHub repos, enable Pages or deploy without explicit user approval.** The user decides when the site goes live.
- **Before any push to the public repo**, audit what would be published:
  - `git ls-files`: only source, data, tests, docs and config. No scratch files, exports, local baselines, `node_modules` or build output.
  - `git log -p`: no personal data or secrets anywhere in history.
  - `scripts/privacy_check.py` passes, with the private blocklist set via `PRIVACY_BLOCKLIST_FILE`, a file outside the repo.
- Commit only when asked. Commit messages should describe *what changed in the fixtures* (e.g. "Move A Mens v Riverside to 12 Nov") for data changes.
- When importing or bulk-editing fixtures from a club source, follow the rules in `REQUIREMENTS.md` §6 and `CLUB.md`. List anything skipped or ambiguous (`?`, `TBC`, missing times) for the user instead of guessing.
- **Never commit build output** (`_site/`) or create a `gh-pages` branch or `/docs` folder. Pages deploys from the CI artifact (`DEPLOYMENT.md` §1).
- Prototype or scratch work goes in the session scratchpad or a git-ignored folder, never in tracked paths.
- Don't invent venue addresses. Leave them blank until there's a source (league fixture pages for the venue name, the venue's own or operator's site for the address), and record the sources in the commit/PR.
- Keep `README.md`, `REQUIREMENTS.md`, `EDITING.md`, `DEPLOYMENT.md`, `TESTING.md`, `SETUP.md` and this file in sync with behaviour changes. Keep these docs generic: club-specific facts belong in `CLUB.md`, `data/` or README's live-links section.

## Setting up a new club

When asked to set up a site for a new club (a fork of the base repo):

- Follow `SETUP.md` step by step, and stop for the human at each GitHub
  settings, secrets and go-live step.
- Never invent venue addresses or times. Leave them blank until there's a
  source, and cite the sources in the commit/PR.
- Never copy another club's data, venues, branding or people into the fork,
  and never copy real data into `tests/data/`.
- Never change `calendar.uid_domain` (or the fixture `id` format) after launch:
  subscribers would get every match twice.
- List ambiguities (unclear teams, opponents, dates, times, venues) for the
  human instead of guessing.
- Keep generic changes out of forks. Only `data/`, `CLUB.md` and README's
  live-links section are fork-owned; a fix to code, tests or generic docs goes
  upstream as a PR to the base repo (SETUP.md §1).
