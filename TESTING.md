# Testing

> **Status:** **Proposed, not implemented yet.** Today the only automated check is
> data validation in `scripts/build.py`.

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
| 1 | Data validation | `build.py --check` (exists) | Typos and invalid fixtures | real data |
| 2 | Unit tests | `pytest` | Validation rules, dates and seasons, ICS escaping and line folding, stable event IDs | test data |
| 3 | Calendar feeds | `icalendar` (Python) in pytest | `.ics` files that calendar apps would reject | real + test data |
| 4 | Link check | [lychee](https://github.com/lycheeverse/lychee-action), offline mode on `_site/` | Broken internal links, assets or feed URLs | real data |
| 5 | UI behaviour | **Playwright** (§3) | Broken filters, views, URL state, console errors, horizontal overflow on phones | test data + real data smoke test |
| 6 | Visual regression | **Playwright screenshots** (§4) | Unintended layout or style changes | test data |
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

### 4.4 Tooling choice: open question

| Option | Pros | Cons |
|---|---|---|
| **Playwright Test (Node/TypeScript)**, used for tests only | Built-in `toHaveScreenshot()`, `--update-snapshots`, HTML report with side-by-side diffs, the best-documented path | Adds Node as a **test-only** dependency (the site build stays Python) |
| Playwright for Python + `pytest-playwright` | Same language as the build, no Node anywhere | No built-in screenshot assertion. Needs a third-party plugin or ~50 lines of our own compare-and-report code, and a weaker diff report. |

**Recommendation: Playwright Test (Node) for UI and visual tests only.** Node
would be needed only in CI and inside the Playwright Docker image, so nothing
extra has to be installed on a Mac. The data and build tooling stays Python.
This relaxes REQUIREMENTS NFR-4 ("no Node toolchain") to "no Node in the site
build", so it needs sign-off before implementing.

## 5. Proposed layout (not created yet)

```
tests/
  data/                 fictional fixtures/teams/venues used by UI + unit tests
  unit/                 pytest: build.py, ICS, privacy guard
  e2e/                  Playwright specs (behaviour + visual)
  __screenshots__/      committed visual baselines (Linux)
playwright.config.ts    (if the Node option is chosen)
```

## 6. Running tests locally (once implemented)

```sh
.venv/bin/python -m pytest                     # unit + ICS + privacy
docker run --rm -v "$PWD":/work -w /work mcr.microsoft.com/playwright:<version> \
  npx playwright test                          # UI + visual, Linux baselines
```
