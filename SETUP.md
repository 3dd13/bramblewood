# Setting up a site for your club

A checklist for the engineer (and their AI agent) creating a fixtures site for
a new club from this base repo. Work through it in order. Nothing here needs a
paid service: GitHub Pages and Actions are free for public repos.

Read the *Sensitive data* rules in [AGENTS.md](AGENTS.md#sensitive-data--read-before-changing-anything)
first. Your fork is **public** from the first push, including its history.

## 1. Files you own vs files from upstream

Your fork tracks the base repo as the `upstream` remote. To keep merges
painless, each file belongs to one side:

| Owned by your fork (edit freely) | From upstream (don't edit in the fork) |
|---|---|
| `data/club.yaml`, `data/teams.yaml`, `data/venues.yaml`, `data/fixtures.yaml` | `scripts/`, `site/`, `tests/` (including `tests/data/` and screenshot baselines) |
| `CLUB.md` (your club's rules for agents and editors) | `.github/`, `package.json`, `playwright.config.ts`, `requirements*.txt`, `pytest.ini` |
| The `<!-- club: live links -->` section of `README.md` | `AGENTS.md`, `CLAUDE.md`, `SETUP.md`, `EDITING.md`, `REQUIREMENTS.md`, `DEPLOYMENT.md`, `TESTING.md`, the rest of `README.md`, `CLUB.template.md` |

Need a code or doc change? Make it **upstream** with a pull request to the base
repo, then pull it into your fork (§4). A change made only in a fork will
conflict with every later update.

## 2. Create the fork

1. **Fork** the base repo on GitHub, or use **"Use this template"** (a template
   copy has no shared history; add the `upstream` remote anyway and merge with
   `--allow-unrelated-histories` the first time).
2. Clone it and add the base repo as `upstream`:
   ```sh
   git clone git@github.com:<owner>/<repo>.git && cd <repo>
   git remote add upstream https://github.com/<base-owner>/<base-repo>.git
   git fetch upstream
   ```
3. Commit with an identity that doesn't publish a personal email, e.g. your
   GitHub no-reply address (`git config user.email <id>+<user>@users.noreply.github.com`).
4. One-time tooling setup (Python 3.9+, Node 22+ for tests only; no Bun):
   ```sh
   python3 -m venv .venv && .venv/bin/pip install -r requirements-dev.txt
   npm install && npx playwright install chromium
   ```

## 3. Make it your club's

Formats and examples for every file are in [EDITING.md](EDITING.md).

1. **`data/club.yaml`:** club names, website, site title and description,
   `calendar.uid_domain`, season start month, brand colours, and the optional
   `bookings` export. See the field table in EDITING.md.
2. **`data/teams.yaml`:** one entry per team: `code`, `name`, `league`, `type`,
   optional `division` and `results_url` (https).
3. **`data/venues.yaml`:** your `home` venue and every opponent club's venue.
   Only public halls, schools or leisure centres. **Never invent an address:**
   leave it blank until you have a source (league fixture pages for the venue
   name, the venue's own or operator's site for the address), and cite the
   sources in the commit or PR.
4. **`data/fixtures.yaml`:** replace the demo matches with yours, in date order
   with `# ── Month YYYY ──` headers. Don't add unconfirmed or TBC matches.
   Skip anything ambiguous and list it for a person to confirm.
5. **`CLUB.md`:** replace the stub with your club's rules (where fixtures come
   from, which sources must never be used, live links, decisions).
   `CLUB.template.md` shows the headings.
6. **`README.md`:** replace only the `<!-- club: live links -->` section with
   your own URLs.

Never copy another club's data, venues or people into your fork, and never put
member names anywhere in it (see AGENTS.md).

## 4. Check everything locally

```sh
.venv/bin/python scripts/build.py --check      # data
.venv/bin/python -m pytest                     # unit, ICS, privacy guard
.venv/bin/python scripts/build.py && PRIVACY_BLOCKLIST_FILE=/path/outside/repo/names.txt .venv/bin/python scripts/privacy_check.py
npm run test:e2e                               # UI, visual, a11y, smoke (your real data)
python3 -m http.server 8000 -d _site           # look at it: http://localhost:8000
```

The name list (one member name per line) lives **outside the repo**. Never
commit it, or any spreadsheet export.

## 5. Publish on GitHub

Do these only with the club owner's approval: going live is their decision.

1. **Audit** before the first push: `git ls-files` (source, data, tests, docs,
   config only) and `git log -p` (no personal data or secrets anywhere in history).
2. **Settings → Secrets and variables → Actions:** add `PRIVACY_BLOCKLIST`, the
   newline-separated member names. It is never printed. Optional, but without
   it CI skips the name check.
3. **Settings → Pages → Source:** "GitHub Actions" (not "Deploy from a branch").
4. Apply the rest of [DEPLOYMENT.md](DEPLOYMENT.md) §3: `github-pages`
   environment limited to `main`, Actions token read-only, Dependabot alerts
   and secret scanning with push protection.
5. **Protect `main`:** require the checks `Data, unit tests, privacy, links`
   and `UI, visual and accessibility tests (Playwright)`.
6. **Push** `main`. The `checks` and `e2e` jobs run, then `deploy`.
7. **Verify** at `https://<owner>.github.io/<repo>/`: every team and match is
   shown, the `.ics` feeds download (`calendar/all.ics`), and subscribing to one
   feed in Google and Apple Calendar works. Record the date and anything still
   open in `CLUB.md`.

## 6. Pulling updates from upstream

```sh
git fetch upstream
git merge upstream/main
.venv/bin/python scripts/build.py --check && .venv/bin/python -m pytest && npm run test:e2e
git push
```

- If you've kept to §1, merges are clean. A conflict means a fork edited an
  upstream file: take upstream's version (`git checkout --theirs <file>`), and
  if your change is still needed, propose it upstream.
- Conflicts in `data/`, `CLUB.md` or the README live-links section are rare
  (upstream only ships demo content there). Keep **your** version
  (`git checkout --ours <file>`; in `README.md`, keep your live-links section
  and upstream's everything else).
- If upstream adds a required field to `data/club.yaml`, the build tells you
  which one; add it, using EDITING.md.
- Read upstream's commit log for behaviour changes before pushing.

## 7. Never change `uid_domain` after launch

`calendar.uid_domain` in `data/club.yaml` is the suffix of every calendar event
ID. Once people have subscribed, changing it (or the fixture `id` format) makes
their calendars show every match twice. Pick it before the first deploy
(lowercase letters, digits and dashes, e.g. `riverside-fixtures`) and leave it.

## 8. Visual baselines

The UI and screenshot tests build from the **fictional** `tests/data/`
(including `tests/data/club.yaml`), not from your `data/`. So rebranding your
fork, or editing its fixtures, never changes the screenshot baselines, and the
committed `*-linux.png` files come from upstream. Your real data is covered by
validation, the privacy guard and the smoke test. See [TESTING.md](TESTING.md) §4.

## 9. Known limitations

- **Time zone:** `site.timezone` supports only `Europe/London` (the ICS feeds
  bundle that VTIMEZONE).
- **Phone check:** `scripts/privacy_check.py` only detects UK mobile numbers.
  Clubs elsewhere get no phone check until it's extended upstream.
- **Language:** user-facing text is British English (`en-GB`).
- **Hosting:** GitHub Pages only, with no per-PR previews.
