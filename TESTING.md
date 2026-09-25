# Testing

All test stages run in CI (`.github/workflows/ci.yml`) on every push and pull
request. **Deploying to GitHub Pages happens only when every stage passes on `main`.**

## 1. Goals

1. A bad data edit or code change **never reaches the live site**.
2. Every change to the UI is **visible to a person before it goes live** (screenshots).
3. Tests are cheap to maintain, and editing fixtures must **not** break them.
4. Tests and logs never contain personal data.

## 2. Stages

| # | Stage | Tool | Catches | Runs on | CI job |
|---|---|---|---|---|---|
| 1 | Data validation | `scripts/build.py --check` | Typos and invalid fixtures, with file and line | real data | `checks` |
| 2 | Unit tests | `pytest` (`tests/unit/test_build.py`) | Validation rules, dates and seasons, ICS escaping and line folding, reproducible builds, stable event IDs | test + real data | `checks` |
| 3 | Calendar feeds | `icalendar` in pytest | `.ics` files that calendar apps would reject: required properties, CRLF, 75-octet lines, BST/GMT offsets, event counts | test data | `checks` |
| 4 | Link check | [lychee](https://github.com/lycheeverse/lychee-action), offline | Broken links between files in `_site/` and in the docs | real data | `checks` |
| 5 | UI behaviour | Playwright (`tests/e2e/behaviour.spec.ts`) | Broken filters, views, URL state, Back/Forward, calendar panel, theme, console errors, overflow at phone width | test data | `e2e` |
| 6 | Visual regression | Playwright screenshots (`visual.spec.ts`) | Unintended layout or style changes | test data | `e2e` |
| 7 | Accessibility | axe-core via Playwright (`a11y.spec.ts`) | WCAG 2 A/AA violations (serious/critical) in both themes | test data | `e2e` |
| 8 | Privacy guard | `scripts/privacy_check.py` (+ its tests in `tests/unit/test_privacy.py`) | Committed secrets or spreadsheet exports, email addresses or phone numbers, personal-data fields, member names from a private blocklist | real data + built site | `checks` |
| – | Smoke | Playwright (`smoke.spec.ts`) | The real site renders every fixture and team, and every feed is served | real data | `e2e` |

### Privacy blocklist
The name check uses a private list of member names. **The list is never
committed.**
- **CI:** it comes from the repository secret `PRIVACY_BLOCKLIST` (one name per
  line). Set it under Settings → Secrets and variables → Actions.
- **Locally:** set `PRIVACY_BLOCKLIST_FILE=/path/outside/repo/names.txt`.

The guard never prints a matched name, email or phone number, because CI logs
are public. If the list isn't set, only the name check is skipped.

## 3. Test data and determinism

- `tests/data/` is a small **fictional** season (4 teams, 4 made-up clubs, 14
  matches) with the edge cases: a venue with no address, a match with no
  time, a match with notes, two matches on one day, and past and upcoming matches.
- UI tests freeze the clock at **2026-11-15** (`page.clock.setFixedTime`).
- Test builds set `SOURCE_DATE_EPOCH`, so "Last updated" and the ICS
  `DTSTAMP` are identical on every run. The pytest suite checks that the build
  is byte-for-byte reproducible.
- Editing the real `data/` never affects the UI or screenshot tests. It only
  goes through validation, the privacy guard and the smoke test.

## 4. Visual regression

- **Projects:** `desktop-light`, `desktop-dark` (1280×800) and `phone-light`,
  `phone-dark` (390×844).
- **Baselines:** `tests/__screenshots__/<project>/<name>-<platform>.png`.
  **Only `*-linux.png` files are committed**, generated in CI. macOS
  `-darwin` baselines are local-only and ignored by git.
- **In CI:** a missing or changed baseline fails the run
  (`updateSnapshots: "none"`). The `playwright-report` artifact has
  expected/actual/diff images, plus a screenshot of every test for review.
- **Changing the UI on purpose:**
  1. Push the change on a branch and open a PR. The visual tests fail and show the diffs.
  2. Run **Actions → "Update screenshot baselines"** on that branch. It
     regenerates the Linux baselines and commits them to the branch.
  3. Review the image diffs in the PR's "Files changed" tab, re-run the checks, and merge.
- **First setup:** no Linux baselines exist until the repo is on GitHub (see DEPLOYMENT.md §4).

**Tooling decision (2026-09-25):** Playwright Test for Node.js is used for
browser tests only; the site build stays Python. Bun was considered and
rejected, because Playwright's test runner requires Node.

## 5. Layout

```
tests/
  data/                    fictional fixtures/teams/venues
  unit/
    test_build.py          validation, helpers, output, iCalendar feeds
    test_privacy.py        privacy guard
  e2e/
    helpers.ts             frozen clock, console-error capture, overflow check
    behaviour.spec.ts      UI behaviour (desktop-light + phone-light)
    visual.spec.ts         screenshots (all 4 projects)
    a11y.spec.ts           axe-core scans
    smoke.spec.ts          real data/
  __screenshots__/         visual baselines (only *-linux.png committed)
pytest.ini                 pytest config (tests/unit)
requirements-dev.txt       pytest + icalendar (on top of requirements.txt)
package.json               test-only Node deps (@playwright/test, @axe-core/playwright), exact versions
playwright.config.ts       projects, snapshot paths, two local servers (test data :4173, real data :4174)
```

## 6. Running tests locally

One-time setup (Python 3.9+, Node 22+):

```sh
python3 -m venv .venv && .venv/bin/pip install -r requirements-dev.txt
npm install && npx playwright install chromium
```

Then:

```sh
.venv/bin/python scripts/build.py --check      # 1. data
.venv/bin/python -m pytest                     # 2, 3, 8. unit, ICS, privacy guard tests
.venv/bin/python scripts/build.py && .venv/bin/python scripts/privacy_check.py   # 8. guard on the built site
lychee --offline --root-dir "$PWD/_site" '_site/**/*.html' './*.md'              # 4. links (brew install lychee)
npm run test:e2e                               # 5, 6, 7 + smoke
npm run test:e2e:update                        # accept new local (macOS) screenshots
npm run test:e2e:report                        # open the HTML report
actionlint                                     # lint workflows (brew install actionlint)
```
