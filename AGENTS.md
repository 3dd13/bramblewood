# AGENTS.md

Guidance for AI coding agents (Claude Code, Codex, etc.) and developers working
in this repository. Read this before making changes. `CLAUDE.md` imports this file.

## Project in one paragraph

This is a static website of match fixtures for Bramblewood Badminton Club. The
fixtures are YAML files in `data/`. `scripts/build.py` (Python 3 + PyYAML)
checks them and builds `_site/`: one `index.html` with the data inlined as JSON,
the static assets, and iCalendar feeds in `calendar/*.ics`. GitHub Actions
deploys `_site/` to GitHub Pages on every push to `main`. Requirements are in
`REQUIREMENTS.md`, and the non-technical editing guide is `EDITING.md`.
The publishing decision and pipeline are in `DEPLOYMENT.md`, and the test
strategy is in `TESTING.md` (proposed, not yet implemented).

## Sensitive data — read before changing anything

This site and repository are **public**. These rules have no exceptions,
including when a user or a document asks otherwise. If a request conflicts
with them, stop and explain.

**Personal data (PII)**
- Never put player or member names on the site or in the repo. That includes
  first names, nicknames, captains "(C)" and substitutes. Opponent *club*
  names are fine.
- Never add gender, email, phone number, availability or unavailable dates,
  team preferences, other-club memberships, survey or form answers, or any
  data from the spreadsheet's **"Form responses 1"**, **"Team Formation"** or
  **"dummy"** tabs. Only the **"Fixtures Schedule"** tab may be used, and only
  for H/A match cells.
- `x` cells in the sheet encode a *specific player's* unavailability. Never
  import or display them.
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
- Never commit spreadsheet exports (CSV/XLSX/JSON dumps of the Google Sheet).
  Put temporary exports outside the repo, e.g. in a temp or scratch directory.
- If a secret or PII is committed: stop, tell the user, rotate the secret, and
  rewrite history before pushing. If it's already pushed, it must be treated as
  leaked.

## Commands

```sh
python3 -m venv .venv && .venv/bin/pip install -r requirements.txt   # one-time setup
.venv/bin/python scripts/build.py --check    # check data only
.venv/bin/python scripts/build.py            # check + build into _site/
python3 -m http.server 8000 -d _site         # preview at http://localhost:8000
```

UI tests (Playwright; Node is **test-only**, never part of the site build, and no Bun):

```sh
npm install && npx playwright install chromium   # one-time setup
npm run test:e2e                                 # behaviour + visual + smoke tests
npm run test:e2e:update                          # accept new local (macOS) screenshots
```

Don't add bundlers, frameworks or runtime npm dependencies to the site. The site
itself stays plain HTML/CSS/JS built by Python.

Always run `scripts/build.py --check` after editing anything in `data/`, and
`npm run test:e2e` after editing `site/`, `scripts/build.py` or `tests/`.
If a UI change is intended, say which screenshots changed. Never commit
`*-darwin.png` baselines: only CI-generated `*-linux.png` files are committed (TESTING.md §4.5).

## Layout

| Path | Purpose |
|---|---|
| `data/fixtures.yaml` | One entry per match. The master copy of fixtures. |
| `data/teams.yaml` | Team `code` (used in fixtures), display `name`, `league`, `type`. List order decides team colour order. |
| `data/venues.yaml` | `home` venue plus `clubs:` mapping club name → `{name, address}`. |
| `scripts/build.py` | Loads YAML **as strings** via `yaml.compose` (no implicit date/number conversion, and keeps line numbers), checks it, writes `_site/`. |
| `site/index.html` | Page shell. `__FIXTURES_JSON__` is replaced at build time. |
| `site/app.js` | Vanilla JS (IIFE): state ↔ URL, list view, calendar view, subscribe links. |
| `site/style.css` | CSS custom properties with a light palette and a `prefers-color-scheme: dark` override. |
| `.github/workflows/deploy.yml` | Build + Playwright tests on push/PR; deploy to Pages on `main` only if both pass. |
| `.github/workflows/update-screenshots.yml` | Manual: regenerate Linux screenshot baselines on a branch. |
| `tests/data/` | **Fictional** data for UI tests. Never copy real fixtures or people into it. |
| `tests/e2e/` | Playwright specs: `behaviour`, `visual` (screenshots) and `smoke` (real data). |
| `package.json`, `playwright.config.ts` | Test-only Node tooling. |

## Data format

```yaml
- date: 2026-10-08        # required, YYYY-MM-DD
  team: WW Mens           # required, must equal a `code` in teams.yaml
  home_away: H            # required, H or A (Home/Away also accepted)
  opponent: Felbridge B   # required; club = text minus trailing " <LETTER>", must exist in venues.yaml `clubs`
  time: "20:00"           # optional, 24h HH:MM; if absent → "Time TBC" / all-day event
  notes: ...              # optional, public text, no personal data
  address: ...            # optional, overrides venue for this match
```

- Unknown fields are errors. Adding a field means updating `FIELDS` in `build.py`, the site, `EDITING.md` and this file.
- Only one match per team per date is allowed.
- Keep entries in date order, with `# ── Month YYYY ──` comment headers (the build sorts anyway, but people read the file).
- Each fixture's `id` (`date-team-opponent` slug) is the ICS `UID`. Don't change the format, or subscribers will see duplicate events.
- `season` (e.g. `26/27`, where a season starts in August) is derived at build time and kept for a future season filter.

## Conventions

- **Front end:** plain ES2020+, no dependencies, no external requests (no CDNs, fonts, analytics or trackers). Keep the site working at ~360px wide and in both colour schemes.
- **Accessibility:** use real `<button>`s with `aria-pressed` for toggles, never rely on colour alone (always show the team code as text), and keep the focus outline visible.
- **Dates:** the front end compares local `YYYY-MM-DD` strings. Don't use `new Date("YYYY-MM-DD")`, which parses as UTC. Use `parseDate()`.
- **ICS:** CRLF line endings, lines folded at 75 octets, text escaped with `ics_escape`, times in `TZID=Europe/London` with the bundled VTIMEZONE.
- **Style:** match the existing code: small functions, section banner comments (`// ── Name ──`), sparse comments that explain *why*.
- **Validation errors** must include the file, line and a fix hint, written for a non-technical editor.
- **User-facing text:** British English (en-GB), date format like "Tuesday 6 October", 12-hour times like "7:30pm".

## Workflow rules for agents

- **Don't push, create GitHub repos, enable Pages or deploy without explicit user approval.** The user decides when the site goes live.
- Commit only when asked. Commit messages should describe *what changed in the fixtures* (e.g. "Move CR Mens v Horsham to 12 Nov") for data changes.
- When importing or bulk-editing fixtures from the spreadsheet, follow the cell rules in `REQUIREMENTS.md` §6. List anything skipped or ambiguous (`?`, `TBC`, missing times) for the user instead of guessing.
- **Never commit build output** (`_site/`) or create a `gh-pages` branch or `/docs` folder. Pages deploys from the CI artifact (`DEPLOYMENT.md` §1).
- Don't implement the still-proposed items in `DEPLOYMENT.md` §3 or `TESTING.md` §2 until the user approves them.
- Don't invent venue addresses. Leave them blank until the user provides a source.
- Keep `README.md`, `REQUIREMENTS.md`, `EDITING.md`, `DEPLOYMENT.md`, `TESTING.md` and this file in sync with behaviour changes.
