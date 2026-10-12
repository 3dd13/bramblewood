# Editing the fixtures

All match data lives in the `data/` folder. When you change a file there and
commit, GitHub checks the data and redeploys the site automatically, usually
within a minute or two.

## Quick edit on github.com

1. Open `data/fixtures.yaml` in the repository on GitHub.
2. Click the ✏️ pencil icon (top right of the file).
3. Make your change, click **Commit changes…**, then **Commit changes**.
4. Watch the **Actions** tab: green ✓ means the site is updated. A red ✗ means
   something in the data looked wrong. Click the run to see the file, line
   number and what to fix. The live site stays as it was until it's fixed.

## Adding a match

Copy an existing entry and change it:

```yaml
- date: 2026-11-12          # YYYY-MM-DD
  team: A Mens              # must match a `code` in data/teams.yaml
  home_away: A              # H or A
  opponent: Riverside B     # club name (+ optional team letter)
  time: "19:30"             # 24-hour; leave the line out if not known yet
  notes: Rearranged from 5 Nov   # optional, shown on the site
```

Indentation matters: every line after `- date:` starts with two spaces.

## Common changes

| To…                          | Do this                                                     |
|------------------------------|-------------------------------------------------------------|
| Reschedule a match           | Change its `date` (and `time`), optionally add a `notes:`   |
| Cancel a match               | Delete the whole entry (all its lines)                      |
| Match not confirmed yet (TBC)| Don't add it until it's confirmed                           |
| One-off different venue      | Add `address: Some Hall, Street, Town AB1 2CD` to the match |
| New opponent club            | Add it under `clubs:` in `data/venues.yaml` first           |
| Opponent venue address       | Fill in `name`/`address` for the club in `data/venues.yaml` |
| Club plays elsewhere in one league | Add a `leagues:` entry for that club in `data/venues.yaml` (see the example at the top of that file) |
| New team / new season        | Add the team to `data/teams.yaml`                           |
| League results link / division | Set `results_url` (a full `https://` link) and `division` for the team in `data/teams.yaml` |
| Club name, website, colours | Edit `data/club.yaml` (see below) |

The calendar feeds (`.ics`) update with every deploy. Subscribed calendars pick
up changes the next time they refresh, which can take from a few hours up to a
day for Google Calendar.

## Club settings (`data/club.yaml`)

One file describes the club. You rarely need to change it after setup.

| Field | Required | What it does |
|---|---|---|
| `club.short_name` | yes | Short name used in headings and calendar names |
| `club.full_name` | yes | Full club name |
| `club.website_url` | no | Club website, linked in the footer (full `https://` link) |
| `site.title` | yes | Page title |
| `site.description` | yes | One-line description for search engines and link previews |
| `site.locale` | yes | Language tag, `en-GB` |
| `site.timezone` | yes | `Europe/London` (the only value supported for now) |
| `calendar.uid_domain` | yes | Suffix of every calendar event ID, e.g. `riverside-fixtures`. **Never change it after launch:** subscribers would see every match twice |
| `season.start_month` | yes | Month the season starts, as a number (`8` = August) |
| `branding.brand` | no | Main colour, in quotes, e.g. `"#4f46e5"` (the default indigo if left out) |
| `branding.brand_ink`, `brand_dark`, `brand_ink_dark`, `focus_dark` | no | Brand text colour, and the dark-mode brand, brand text and focus colours. Defaults are used for any left out; check text contrast (4.5:1) in both themes |
| `bookings.club_night_weekday` | no | Day name, e.g. `thursday`. Turns on the admin booking export below; leave the whole `bookings:` section out to turn it off |

## Home venue booking export (admins)

If `bookings:` is set in `data/club.yaml`, the site builds an unlisted admin
page for booking the hall with the venue manager:

`https://<your-site>/admin/`

It links to CSV files (columns `Date,Day,Matches`, e.g. `8 Oct 2026,Thu,1`):

| File | Contents |
|---|---|
| `home-bookings-oct-dec-2026.csv` (and `jan-mar-2027`, `apr-jun-2027`, …) | Every date with a home match in that quarter, and how many |
| `home-bookings-<club night>s-2026-27.csv` (e.g. `thursdays`) | Home dates on the club-night weekday only, for the whole season (these usually need special arrangement with the venue) |

- The files update automatically every time the fixtures change, so there's nothing to run. Download a fresh copy before sending it to the venue.
- Past dates stay in the files as a booking record. Away matches are never included.
- The page isn't linked from the public site and asks search engines not to index it. **Unlisted isn't secret**, though: don't post the link publicly. It holds nothing that isn't already on the public site.

## Keep it public-safe

The website and this repository are **public**.

- Don't add player names (not even first names), contact details or who can
  or can't play. That includes the `notes:` field.
- Only use public venue addresses (sports halls, schools, leisure centres).
- Never paste passwords, API keys or other credentials into any file.
- Don't upload spreadsheet exports of the club sheet. They include members'
  personal answers.

If something private gets committed by mistake, tell the repository owner
straight away. Deleting it in a new commit isn't enough, because it stays
in the history.

## Previewing locally (optional)

```sh
python3 -m venv .venv && .venv/bin/pip install -r requirements.txt
.venv/bin/python scripts/build.py            # check + build into _site/
python3 -m http.server 8000 -d _site         # open http://localhost:8000
```

`.venv/bin/python scripts/build.py --check` only checks the data.
