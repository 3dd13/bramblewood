# Testing

> **Status:**
> - **Implemented:** stage 1 (data validation), stage 5 (Playwright UI tests) and stage 6
>   (Playwright visual regression), including the CI job and the baseline-update workflow.
> - **Still proposed:** stages 2, 3, 4, 7 and 8.
> - **Pending:** the Linux reference screenshots (baselines) can only be created once the GitHub repo exists (§4.5).

## 1. Goals

1. A bad data edit or code change **never reaches the live site**.
2. Every change to the UI is **visible to a person before it goes live**.
3. Tests are cheap to maintain, and editing fixtures must **not** break them.
4. Tests never contain personal data.

## 2. Test stages

All stages run on every pull request and every push. The deploy runs only
on `main` and only after all stages pass (see [DEPLOYMENT.md](DEPLOYMENT.md) §3.1).

| # | Stage | Tool | Catches | Runs on |
|---|---|---|---|---|
| 1 ✅ | Data validation | `build.py --check` (exists) | Typos and invalid fixtures | real data |
| 2 | Unit tests | `pytest` | Validation rules, dates and seasons, ICS escaping and line folding, stable event IDs | test data |
| 3 | Calendar feeds | `icalendar` (Python) in pytest | `.ics` files that calendar apps would reject | real + test data |
| 4 | Link check | [lychee](https://github.com/lycheeverse/lychee-action), offline mode on `_site/` | Broken internal links, assets or feed URLs | real data |
| 5 ✅ | UI behaviour | **Playwright** (§3) | Broken filters, views, URL state, console errors, horizontal overflow on phones | test data + real data smoke test |
| 6 ✅ | Visual regression | **Playwright screenshots** (§4) | Unintended layout or style changes | test data |
| 7 | Accessibility | axe-core via Playwright | Missing labels, low contrast, ARIA mistakes | test data |
| 8 | Privacy guard | small script | Name-like or personal fields (`email:`, `phone:`) in `data/` or `_site/`; spreadsheet exports in the tree | real data |

## 3. Playwright UI tests

Playwright runs the built site in real browsers (Chromium, and optionally
WebKit for iPhone Safari) against a local static server.

**Behaviours to cover:**
- The page loads with no console errors, and the match count equals the number of fixtures.
- **Team filter:** selecting teams updates the list and the URL (`?teams=…`), and "All teams" resets it.
- **Home/Away filter:** each option shows only matching fixtures.
- **List ↔ calendar:** the view switch works, and so does month navigation (prev/next disabled at the ends).
- **Calendar day selection:** clicking a day shows that day's matches, and "Show whole month" resets it.
- **Past matches:** "Hide past matches" works, past matches are dimmed, and the next match is highlighted.
- **Shared links:** opening a filtered URL reproduces the same view.
- **Subscribe panel:** the links point to the right `.ics` file, and each feed URL returns 200.
- **Phone width (390×844):** the page never scrolls horizontally.

## 4. Capturing UI changes with Playwright screenshots

**Recommendation: yes. Use Playwright screenshots both as a test (visual
regression) and as a review aid (screenshot gallery).**

### 4.1 Screenshot matrix

Each state is captured at 2 viewports × 2 colour schemes:

| State | Desktop 1280 | Phone 390 |
|---|---|---|
| List view, all teams | light + dark | light + dark |
| List view, one team + Away filter | light + dark | light + dark |
| Calendar view, a busy month | light + dark | light + dark |
| Calendar view, a day selected | light + dark | light + dark |
| Subscribe panel open | light | light |

That's about 18 images.

### 4.2 Two ways to use them

1. **Visual regression (blocking).** Compare each screenshot with a committed
   baseline PNG and fail when the difference is above a small threshold. The
   diff images (expected / actual / diff) are uploaded as a workflow artifact
   so a reviewer can see exactly what changed.
2. **Screenshot gallery (non-blocking).** For every PR, upload the full set
   of current screenshots as an artifact (or a single HTML report). This works
   as a "preview" of the change, since GitHub Pages has no preview deployments.

### 4.3 Making screenshots reliable

Screenshot tests are only useful if they don't fail for no reason. For this site:

- **Freeze the clock.** The page depends on today's date (past dimming, next
  match, default calendar month). Use Playwright's clock API
  (`page.clock.set_fixed_time(...)`) to fix a date such as 2026-11-15.
- **Use fixed test data, not the real fixtures.** Build a separate site from
  `tests/data/*.yaml`, a small made-up season with fictional opponent clubs.
  Otherwise **every fixture edit would change the screenshots** and force a
  baseline update. The real data still gets the non-visual smoke tests.
- **Hide changing content.** The "Last updated" timestamp is either set from
  an environment variable during test builds, or masked in the screenshot.
- **Turn off animations** (`animations: "disabled"`) and wait for fonts to load.
- **Make baselines on the same OS as CI.** Screenshots differ between macOS
  and Linux (font rendering). Generate and compare baselines on Linux only: in
  CI, or locally in the official Playwright Docker image. A manual
  `workflow_dispatch` job ("update screenshots") can regenerate baselines and
  commit them in a PR for review.
- **Baselines are committed** under `tests/__screenshots__/`. They show only
  fictional test data, so they contain no personal data.

### 4.4 Tooling choice: decided, Playwright Test (Node)

**Decision (agreed 2026-09-25):** use **Playwright Test for Node.js**, for UI
and visual tests only. Node is a *test-only* dependency; the site build stays
Python. **Bun was considered and rejected:** Playwright's test runner still
needs Node (Playwright 1.62+ refuses to load test files under the Bun runtime),
so Bun would only add a second JavaScript runtime.

Options that were considered:

| Option | Pros | Cons |
|---|---|---|
| **Playwright Test (Node/TypeScript)**, used for tests only | Built-in `toHaveScreenshot()`, `--update-snapshots`, HTML report with side-by-side diffs, the best-documented path | Adds Node as a **test-only** dependency (the site build stays Python) |
| Playwright for Python + `pytest-playwright` | Same language as the build, no Node anywhere | No built-in screenshot assertion. Needs a third-party plugin or ~50 lines of our own compare-and-report code, and a weaker diff report. |

REQUIREMENTS NFR-4 is relaxed accordingly: no Node in the site *build*, Node allowed for tests.

### 4.5 Baselines: how they're managed

- Baselines live in `tests/__screenshots__/<project>/<name>-<platform>.png`.
  Projects: `desktop-light`, `desktop-dark`, `phone-light`, `phone-dark`.
- **Only `*-linux.png` files are committed.** They're generated in CI, and
  `.gitignore` excludes macOS (`-darwin`) and Windows ones.
- **Local (macOS):** the first run of `npm run test:e2e` creates local
  `-darwin` baselines. Later runs compare against them. That's useful for
  catching your own unintended changes before pushing.
- **In CI:** a missing or changed baseline fails the run
  (`updateSnapshots: "none"`). The `playwright-report` artifact contains
  expected/actual/diff images for every failure, and a screenshot of every test
  (the "gallery").
- **Changing the UI on purpose:**
  1. Push the change on a branch and open a PR. The visual tests fail and show the diffs.
  2. Run **Actions → "Update screenshot baselines"** on that branch.
     It regenerates the Linux baselines and commits them to the branch.
  3. Review the image diffs in the PR's "Files changed" tab, re-run the checks, and merge.
- **First-time setup:** no Linux baselines exist until the repo is on GitHub.
  See DEPLOYMENT.md §4: run the update workflow on a branch before the first
  deploy to `main`.

## 5. Layout

```
tests/
  data/                    fictional fixtures/teams/venues ("today" frozen at 2026-11-15)
  e2e/
    helpers.ts             frozen clock, console-error capture, overflow check
    behaviour.spec.ts      stage 5 (desktop-light + phone-light)
    visual.spec.ts         stage 6 (all 4 projects, 18 screenshots)
    smoke.spec.ts          real data/: renders every fixture, every feed returns 200
  __screenshots__/         visual baselines (only *-linux.png committed)
  unit/                    (proposed) pytest: build.py, ICS, privacy guard
package.json               test-only Node deps (@playwright/test, pinned)
playwright.config.ts       projects, snapshot paths, two local servers (test data :4173, real data :4174)
.github/workflows/
  deploy.yml               build + e2e must pass before deploy
  update-screenshots.yml   manual: regenerate Linux baselines on a branch
```

## 6. Running tests locally

One-time setup (Node ≥ 22; installed with Homebrew on the maintainer's Mac):

```sh
python3 -m venv .venv && .venv/bin/pip install -r requirements.txt
npm install
npx playwright install chromium
```

Then:

```sh
npm run test:e2e             # all Playwright tests (builds both test sites itself)
npm run test:e2e -- visual   # only the screenshot tests
npm run test:e2e:update      # accept current screenshots as local (macOS) baselines
npm run test:e2e:report      # open the HTML report (screenshots, diffs, traces)
```

Changing `tests/data/` changes the screenshots, so update the baselines on purpose when you do.
Editing the real `data/` never affects the screenshot tests.
