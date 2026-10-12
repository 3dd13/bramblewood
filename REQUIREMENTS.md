# Requirements

## 1. Purpose

A badminton club enters several teams in local leagues. This website gives
members **one public place to see every match**: when, where, which team and
who the opponent is. It replaces reading the club's planning spreadsheet.

The code is generic: one repo serves any club, which forks it and edits only
`data/` and `CLUB.md` (SETUP.md). Club-specific rules live in `CLUB.md`.

## 2. Users

| User | Needs |
|---|---|
| Players | See their team's upcoming matches, the venue and start time; add matches to their calendar |
| Captains | Share a link to their team's fixtures |
| Fixture organiser (maintainer) | Update fixtures several times a season without technical skills; get told clearly when a change is wrong |
| Club admin | Get the home-venue booking dates without reading the fixture list |
| Engineer setting up a new club | Fork, configure and publish a site for another club without changing code |

## 3. Scope

The site covers **one season** of one club's teams:

- **Club:** name, website, title, colours and settings in `data/club.yaml`.
- **Teams:** each with a code, name, league and type in `data/teams.yaml`.
- **Season:** derived from the fixture dates; a season starts in
  `season.start_month` (e.g. August, giving seasons like `26/27`).
- **Venues:** one home venue plus each opponent club's venue in `data/venues.yaml`.

## 4. Functional requirements

### 4.1 Pages (team-first design)
- **FR-0a:** **Overview page** (landing): club header with the club's next match, then one card per team showing that team's next match, home/away/played counts, and "Fixtures" and "Add to calendar" actions.
- **FR-0b:** **Fixtures page:** one multi-select team row ("All teams" clears it), a selection card (team name/league, or the list of selected teams, match counts, next match for the selection), filters, and the list or calendar.
- **FR-0c:** Overview and Fixtures have different URLs. Switching between them adds a browser history entry, so Back/Forward work. Filter changes replace the current entry. The Overview URL never carries filters, and the Fixtures selection is remembered during the visit.

### 4.2 Fixture display
- **FR-1:** Show every confirmed match with its date, day of week, start time, team, home/away, opponent and venue. When exactly one team is selected, its badge isn't repeated on each match.
- **FR-2:** Show matches without a start time as "Time TBC", and away matches with no known address as "Venue TBC".
- **FR-3:** Mark past matches ("Played", greyed by colour, still ≥ 4.5:1 contrast) but keep them visible. Tell past and upcoming apart using the viewer's local date.
- **FR-4:** Highlight the next upcoming match ("Next up"). The Overview header shows the club's next match; the Fixtures selection card shows the next match for the current selection. Countdowns ("Today", "Tomorrow", "In N days") appear only when the match is 14 days away or less. Before and after the season, show "First match:" / "Season complete".
- **FR-5:** Show optional per-match notes (e.g. "Rearranged from 9 Oct").

### 4.3 Views and filters
- **FR-6:** The **list view** groups matches by month, in date order, as a timeline.
- **FR-7:** The **calendar view** shows a Monday-first month grid with previous/next navigation, limited to the season's months. Clicking a day shows that day's matches ("Show whole month" resets). The selected day looks different from the next-match day. On phones, days show coloured dots and the matches are listed below the grid.
- **FR-8:** Provide a "Jump to it" link to the next match.
- **FR-9:** Filter by one or more teams, using a single team control. The team toggles (and the list of selected teams) are sorted alphabetically by team code; the Overview card order follows `teams.yaml`.
- **FR-9a Team colours:** each league has a colour family (greens, reds, blues, purples, taken in order of first appearance in `teams.yaml`), and within a league shades run Men's → Mixed → Ladies. Every shade has ≥ 3:1 contrast as a dot on light and dark surfaces. Leagues beyond four, or with more than three teams, fall back to neutral extra colours.
- **FR-9b Home/Away:** shown by shape, not colour, so it never clashes with team colours: **Home = filled grey**, **Away = grey outline**, each with an icon and the word. The same rule applies to the calendar (filled/outlined labels on desktop, filled dots/rings on phones, with a legend) and to played matches (same shapes, in grey).
- **FR-10:** Filter by Home / Away / All.
- **FR-11:** Optionally hide past matches.
- **FR-12:** Store the page, filters, view, month (calendar only) and selected day in the URL so they can be shared, e.g. `?view=calendar&teams=cr-mens&month=2026-11&day=2026-11-19`. Invalid or out-of-season values are ignored or clamped.
- **FR-12a:** A light/dark switch. It follows the system setting until used, then remembers the choice in the browser, with no flash of the wrong theme.

### 4.3a League results and club links
- **FR-12b:** Each team can link to its league's official results/table page (`results_url`, shown as "League table & results", or "Latest results" when no division is set). The link appears on the team's Overview card, on the Fixtures selection card (one link per selected team), and in a footer "League results" index grouped by league. Teams sharing a page (e.g. two teams in the same league) share one footer link.
- **FR-12c:** The footer links to the club website (`club.website_url` in `data/club.yaml`), if set. The club name, page title, description and brand colours also come from `data/club.yaml`.
- **FR-12d:** External links open in a new tab (`rel="noopener"`), show an external-link icon, and tell screen readers they open in a new tab. `results_url` must be `https://` (checked by the build).

### 4.3b Home venue booking export (admins)
- **FR-12e:** When `bookings.club_night_weekday` is set in `data/club.yaml`, every build writes an unlisted admin page at `admin/` with CSV lists of home-match dates and the number of home matches on each (`Date,Day,Matches`, e.g. `8 Oct 2026,Thu,1`, sorted by date). There's one file per calendar quarter that has home matches, plus one whole-season list of the club-night weekday only (e.g. Thursdays). Past dates are kept and away matches excluded.
- **FR-12f:** The admin page isn't linked from any public page, carries `noindex, nofollow`, and contains no data beyond the public fixtures. Unlisted is not access control, and that's acceptable for this data.

### 4.4 Venues
- **FR-13:** Home matches use the home venue. Away matches use the opponent club's venue from `data/venues.yaml`, looked up by club name without the team letter ("Riverside B" → "Riverside"). A club can have a different venue per league (`leagues:`), because some clubs host different leagues at different halls.
- **FR-14:** Allow an individual match to override its address.
- **FR-15:** Show a Google Maps link wherever an address is known.

### 4.5 Calendar subscription
- **FR-16:** Publish an iCalendar (`.ics`) feed for all matches and one for each team.
- **FR-17:** Events use the club's time zone (`site.timezone`; only Europe/London is supported for now) and last 2h30. A match without a time becomes an all-day event.
- **FR-18:** Event IDs (fixture `id` + `@` + `calendar.uid_domain`) must stay the same across rebuilds, so subscribed calendars update events instead of duplicating them. `uid_domain` must never change after launch.
- **FR-19:** An "Add to my calendar" panel (a bottom sheet on phones) lists **one row per selected team** (or every team plus "All club matches" when none is selected). Each row has **Subscribe** (webcal), **Google** and **Copy link**. Several teams are added as separate calendars; there are no combined feeds (to keep the build at one file per team).

### 4.6 Editing and deployment
- **FR-20:** The data lives in YAML files in the repository, and `data/fixtures.yaml` is the **master copy**. A club spreadsheet, if any, is used only for a one-time import (rules in §6 and `CLUB.md`).
- **FR-21:** The data can be edited in GitHub's web editor with no local tools.
- **FR-22:** Every push to `main` checks the data and, if it's valid, rebuilds and redeploys the site automatically.
- **FR-23:** If the data is invalid, the deploy fails. Errors name the file, line and problem, and the live site stays unchanged.
- **FR-24:** The checks cover: required fields, real calendar dates, known team codes, `H`/`A` values, 24-hour `HH:MM` times, known opponent clubs, unknown field names, and duplicate matches (same team, same date).
- **FR-25:** Pull requests go through the same checks but are not deployed. The full pipeline is in DEPLOYMENT.md and TESTING.md.

### 4.7 Reuse by other clubs
- **FR-26:** Everything club-specific (names, URLs, colours, time zone, season start, calendar ID suffix, booking export) comes from `data/` or `CLUB.md`. Code, tests and generic docs contain no club specifics.
- **FR-27:** A fork pulls updates with `git merge upstream/main` without conflicts as long as it edits only its own files (SETUP.md §1).
- **FR-28:** Tests use the fictional `tests/data/` (including `club.yaml`), so a fork's data or branding never changes test results or screenshot baselines.

## 5. Non-functional requirements

- **NFR-1 Privacy:** The public site must contain **no personal data** about members (see §7).
- **NFR-2 Security:** No secrets in the repository. Deployment uses GitHub's built-in OIDC Pages token only.
- **NFR-3 Cost:** Free to host and run (GitHub Pages + Actions).
- **NFR-4 Simplicity:** No front-end framework, and no Node in the site *build*: the only build dependency is Python 3 + PyYAML. Node is allowed as a **test-only** dependency (Playwright; see TESTING.md). No Bun.
- **NFR-10 Release safety:** Built output is never committed. Pages deploys from the CI artifact of `main` (DEPLOYMENT.md). Automated tests must pass before deploying (TESTING.md).
- **NFR-5 Responsive:** Usable from 320 px wide, with no horizontal page scrolling. Tap targets are at least 44×44 px on phones (the only exception is calendar day cells at 320 px).
- **NFR-6 Theme:** Supports light and dark mode (the system setting, or the in-page switch).
- **NFR-7 Accessibility:** WCAG 2 AA: text contrast of at least 4.5:1 in both themes, semantic buttons with `aria-pressed`, labelled calendar cells, visible focus, focus kept on re-render and moved into and out of the panel, and `prefers-reduced-motion` respected. Colour is never the only signal: the team code is always shown in full as text. Checked automatically with axe-core.
- **NFR-8 Performance:** One HTML page with the data inlined, no third-party scripts or fonts, and no tracking or analytics.
- **NFR-9 Robustness:** The site works offline once loaded. No runtime API calls.

## 6. Data import rules (one-time, from a club source)

A club's own source (planning spreadsheet, league site, emails) and its exact
cell rules are described in its `CLUB.md`. For every club:

- Import **confirmed matches only**: date, team, home/away, opponent and, if
  known, time. Don't import `TBC`, `?` or other unconfirmed entries.
- **Never import personal data**: availability marks, preferences, team
  selection, form or survey answers. Skip any tab or sheet that holds them.
- Don't guess. List skipped or ambiguous entries (unclear times, unknown
  opponents, missing venues) for the organiser.

## 7. Sensitive data policy

1. **No personal data on the site or in the repository.** This includes player
   names (including first names and captains), gender, contact details,
   availability or unavailable dates, preferences, other-club memberships and
   survey answers. The site shows teams, opponents, dates, times and venues only.
2. **Venue addresses** must be public addresses of sports halls or schools,
   never a person's home address.
3. **No secrets in the repository**: no API keys, tokens, passwords, service
   account JSON, `.env` files, private keys or OAuth credentials. If a future
   feature needs a secret (e.g. syncing from Google Sheets), store it in GitHub
   Actions secrets and never print it in logs.
4. **Spreadsheet exports** (CSV/XLSX) must not be committed. They can include
   personal-data tabs.
5. If personal data or a secret is committed by mistake, **rotate the secret
   immediately** and remove the data from git history. Deleting it in a new
   commit isn't enough, because history stays public.

## 8. Out of scope (for now)

- Match results/scores and league tables
- Squad lists or player availability (these conflict with §7)
- Logins, admin UI or a CMS
- Automatic sync from a club spreadsheet

## 9. Future ideas

- **Season filter** (e.g. "26/27"), once more than one season of data exists. Each fixture already carries a `season` field for this.
- A custom domain.
- More time zones, and phone-number checks beyond UK numbers in the privacy guard.
