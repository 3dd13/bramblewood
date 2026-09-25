# Requirements

## 1. Purpose

Bramblewood Badminton Club enters several teams in local leagues. This website
gives members **one public place to see every match**: when, where, which team
and who the opponent is. It replaces reading the club's planning spreadsheet.

## 2. Users

| User | Needs |
|---|---|
| Players | See their team's upcoming matches, the venue and start time; add matches to their calendar |
| Captains | Share a link to their team's fixtures |
| Fixture organiser (maintainer) | Update fixtures several times a season without technical skills; get told clearly when a change is wrong |

## 3. Scope

The site covers the **2026/27 season** (Sep 2026 – May 2027) for these teams:

| Code | Team | League |
|---|---|---|
| WW Mens | West Weald Men's | West Weald League |
| CR Mens | Crawley Men's | Crawley League |
| TW Mens 6 | Tunbridge Wells Men's 6 | Tunbridge Wells League |
| TW Mixed 6 | Tunbridge Wells Mixed 6 | Tunbridge Wells League |
| CR Mixed | Crawley Mixed | Crawley League |
| WW Combi | West Weald Combi | West Weald League |
| MS Combi | Mid Sussex Mixed Combi Div 2 | Mid Sussex League |
| MS Ladies | Mid Sussex Ladies | Mid Sussex League |
| WW Ladies | West Weald Ladies | West Weald League |

The home venue is **Brambletye School, Lewes Rd, East Grinstead RH19 3PD**.

## 4. Functional requirements

### 4.1 Fixture display
- **FR-1:** Show every confirmed match with its date, day of week, start time, team, home/away, opponent and venue.
- **FR-2:** Show matches without a start time as "Time TBC", and away matches with no known address as "Venue TBC".
- **FR-3:** Dim past matches but keep them visible. Tell past and upcoming apart using the viewer's local date.
- **FR-4:** Highlight the next upcoming match, and summarise it in the page header.
- **FR-5:** Show optional per-match notes (e.g. "Rearranged from 9 Oct").

### 4.2 Views
- **FR-6:** The **list view** groups matches by month, in date order.
- **FR-7:** The **calendar view** shows a Monday-first month grid with previous/next navigation, limited to months that have fixtures. Clicking a day shows that day's matches below the grid; otherwise the whole month's matches are shown there.
- **FR-8:** In the list view, provide a way to jump to the next match.

### 4.3 Filters
- **FR-9:** Filter by one or more teams ("All teams" by default).
- **FR-10:** Filter by Home / Away / All.
- **FR-11:** Optionally hide past matches.
- **FR-12:** Store filters and the current view in the URL so they can be shared (e.g. `?teams=cr-mens&view=calendar`).

### 4.4 Venues
- **FR-13:** Home matches use the home venue. Away matches use the opponent club's venue from `data/venues.yaml`, looked up by club name without the team letter ("Felbridge B" → "Felbridge").
- **FR-14:** Allow an individual match to override its address.
- **FR-15:** Show a Google Maps link wherever an address is known.

### 4.5 Calendar subscription
- **FR-16:** Publish an iCalendar (`.ics`) feed for all matches and one for each team.
- **FR-17:** Events use the Europe/London time zone and last 2h30. A match without a time becomes an all-day event.
- **FR-18:** Event IDs must stay the same across rebuilds, so subscribed calendars update events instead of duplicating them.
- **FR-19:** Provide Subscribe (webcal), Google Calendar and Copy link actions.

### 4.6 Editing and deployment
- **FR-20:** The data lives in YAML files in the repository, and `data/fixtures.yaml` is the **master copy**. The Google Sheet was used only for the one-time import.
- **FR-21:** The data can be edited in GitHub's web editor with no local tools.
- **FR-22:** Every push to `main` checks the data and, if it's valid, rebuilds and redeploys the site automatically.
- **FR-23:** If the data is invalid, the deploy fails. Errors name the file, line and problem, and the live site stays unchanged.
- **FR-24:** The checks cover: required fields, real calendar dates, known team codes, `H`/`A` values, 24-hour `HH:MM` times, known opponent clubs, unknown field names, and duplicate matches (same team, same date).
- **FR-25:** Pull requests are checked but not deployed.

## 5. Non-functional requirements

- **NFR-1 Privacy:** The public site must contain **no personal data** about members (see §7).
- **NFR-2 Security:** No secrets in the repository. Deployment uses GitHub's built-in OIDC Pages token only.
- **NFR-3 Cost:** Free to host and run (GitHub Pages + Actions).
- **NFR-4 Simplicity:** No front-end framework, no Node toolchain. The only build dependency is Python 3 + PyYAML.
- **NFR-5 Responsive:** Usable at phone width (~360–400 px). On small screens the calendar shows coloured dots instead of labels.
- **NFR-6 Theme:** Supports light and dark mode (`prefers-color-scheme`).
- **NFR-7 Accessibility:** Semantic buttons with `aria-pressed`, labelled calendar cells, visible focus outlines, and colour never the only signal (the team code is always shown as text).
- **NFR-8 Performance:** One HTML page with the data inlined, no third-party scripts or fonts, and no tracking or analytics.
- **NFR-9 Robustness:** The site works offline once loaded. No runtime API calls.

## 6. Data import rules (one-time, from the club spreadsheet)

The source was the "Fixtures Schedule" tab: one row per date, one column per team.

| Cell value | Meaning | Imported? |
|---|---|---|
| `H - <Opponent> <time>` | Home match | Yes |
| `A - <Opponent> <time>` | Away match | Yes |
| `x` | One of the team's players can't play that date | No (planning info only) |
| `---` | The club prefers not to play that date | No |
| contains `TBC` | Being rescheduled | No, until confirmed |
| `?` | Unconfirmed | No |

Times in the sheet are evening times ("8:00" → 20:00, "6pm" → 18:00). The
other tabs (form responses, team formation) contain **personal data and must
never be imported**.

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
4. **Spreadsheet exports** (CSV/XLSX) must not be committed. They include the
   personal-data tabs.
5. If personal data or a secret is committed by mistake, **rotate the secret
   immediately** and remove the data from git history. Deleting it in a new
   commit isn't enough, because history stays public.

## 8. Out of scope (for now)

- Match results/scores and league tables
- Squad lists or player availability (these conflict with §7)
- Logins, admin UI or a CMS
- Automatic sync from the Google Sheet

## 9. Future ideas

- **Season filter** (e.g. "26/27"), once more than one season of data exists. Each fixture already carries a `season` field for this.
- Opponent venue addresses: the organiser will provide sources, then fill in `data/venues.yaml`.
- A custom domain.
