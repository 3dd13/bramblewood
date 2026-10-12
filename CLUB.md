# CLUB.md — Bramblewood Badminton Club

Club-specific rules for agents and editors. Adds to [AGENTS.md](AGENTS.md);
where they conflict, the stricter rule wins.

This file is **owned by this fork** (see [SETUP.md](SETUP.md)). Generic changes
belong in the base repo `3dd13/badminton-fixtures`, not here.

## The club

| | |
|---|---|
| Club | Bramblewood Badminton Club |
| Club website | https://www.bramblewoodbadminton.club/ (footer link, from `data/club.yaml`) |
| Live site | https://3dd13.github.io/bramblewood/ |
| Calendar feeds | `https://3dd13.github.io/bramblewood/calendar/<team>.ics` (or `all.ics`) |
| Admin booking export (unlisted) | https://3dd13.github.io/bramblewood/admin/ — never link it from public pages or post it publicly |
| Repository | https://github.com/3dd13/bramblewood (public), tracking `upstream` = `3dd13/badminton-fixtures` |
| Season covered | 2026/27 (Sep 2026 – May 2027), 9 teams in 5 leagues (see `data/teams.yaml`) |
| Home venue | Brambletye School, Lewes Rd, East Grinstead RH19 3PD (`data/venues.yaml`) |
| Club night | Thursday (`bookings.club_night_weekday`): Thursday home dates need special arrangement with the venue |
| Calendar UID domain | `bramblewood-fixtures` (`calendar.uid_domain`). **Never change it.** The site has been live with this value since 2026-09-25, and changing it gives every subscriber duplicate events |

## The club spreadsheet (Google Sheet)

The fixtures were imported once from the club's planning spreadsheet.
`data/fixtures.yaml` is now the **master copy**; the sheet is not synced (FR-20).

**Tabs**
- Only the **"Fixtures Schedule"** tab may be used, and only for H/A match cells.
- Never read, import, quote or summarise the **"Form responses 1"**,
  **"Team Formation"** or **"dummy"** tabs. They hold members' personal data
  (names, gender, contact details, availability, preferences, survey answers).
- Never commit exports of the sheet (CSV/XLSX/JSON), not even of the
  Fixtures Schedule tab: put temporary exports in a scratch directory outside the repo.

**Cell rules ("Fixtures Schedule": one row per date, one column per team)**

| Cell value | Meaning | Import? |
|---|---|---|
| `H - <Opponent> <time>` | Home match | Yes |
| `A - <Opponent> <time>` | Away match | Yes |
| `x` | A *specific player* can't play that date | **Never** — personal data; don't import or display |
| `---` | The club prefers not to play that date | No |
| contains `TBC` | Being rescheduled | No, until confirmed |
| `?` | Unconfirmed | No |

- Times in the sheet are evening times: "8:00" → `20:00`, "6pm" → `18:00`.
  A cell with no time gets no `time:` line ("Time TBC").
- List anything skipped or ambiguous (`?`, `TBC`, missing or odd times,
  unknown opponents) for the organiser instead of guessing.

## Privacy blocklist

The member-name list for `scripts/privacy_check.py` is taken from the club
spreadsheet and kept **outside the repo** (`PRIVACY_BLOCKLIST_FILE` locally).
As of 2026-09-25 the owner had not yet added the `PRIVACY_BLOCKLIST` Actions
secret, so the name check has only run locally; adding it is the owner's call.

## Commits and merges

- Commits use the GitHub no-reply address
  `223555+3dd13@users.noreply.github.com`, so no personal email is published.
- Merges made with GitHub's web button use the account's commit email. Either
  turn on **GitHub → Settings → Emails → "Keep my email addresses private"**
  (and "Block command line pushes that expose my email"), or merge green PRs as
  a fast-forward from a clone (`git merge --ff-only <branch> && git push`).

## Deployment history

Live since **2026-09-25**, deployed by `.github/workflows/ci.yml` from `main`.

Repository settings from [DEPLOYMENT.md](DEPLOYMENT.md) §3 were applied on
2026-09-25 (Pages source, `github-pages` environment, Actions token, security
features, branch protection), except the optional `PRIVACY_BLOCKLIST` secret.

Going live (2026-09-25):
- [x] Created the public repo `3dd13/bramblewood`, with no-reply commit identity.
- [x] Final audit: only needed files tracked, no personal data or secrets in history. Checked against the private name list locally.
- [x] Applied the repository settings.
- [x] First push: checks passed; Playwright failed only on the missing Linux baselines (expected).
- [x] Generated the baselines with **Update screenshot baselines** on a branch (PR #3), reviewed them, merged once green.
- [x] Deployed. The site, `fixtures.json` and all `.ics` feeds are served (`text/calendar`, 84 events in `all.ics`).
- [ ] Subscribe to one feed in Google and Apple Calendar to confirm it works (owner).
- [ ] Optional: add the `PRIVACY_BLOCKLIST` secret.

## Decisions (dated)

- **2026-09-25:** Team-first design (Overview + Fixtures pages) chosen.
- **2026-09-25:** "Add to my calendar" offers one feed per team, no combined feeds.
- **2026-09-25:** Build in CI and deploy the Pages artifact; never commit `_site/`.
- **2026-09-25:** Playwright on Node for browser tests only; Bun rejected.

## Open items

- Opponent venue addresses: the organiser will provide sources, then fill in
  `data/venues.yaml` (never invent one; cite sources in the commit/PR).
- A custom domain (not decided).
