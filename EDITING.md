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
  team: CR Mens             # must match a `code` in data/teams.yaml
  home_away: A              # H or A
  opponent: Felbridge B     # club name (+ optional team letter)
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

The calendar feeds (`.ics`) update with every deploy. Subscribed calendars pick
up changes the next time they refresh, which can take from a few hours up to a
day for Google Calendar.

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
