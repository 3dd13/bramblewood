# CLUB.md — <Your Club Name>

Club-specific rules for agents and editors. Adds to [AGENTS.md](AGENTS.md);
where they conflict, the stricter rule wins.

This file is **owned by your fork**: upstream never changes it after you
replace it (see [SETUP.md](SETUP.md)). Keep generic changes out of it and
propose them to the base repo instead. Like everything else here it is
**public**: no names, contact details, secrets or private links.

Replace this stub with your club's rules. Suggested headings:

## The club
Club name, club website, live site URL, calendar feed URL, repository, the
season covered, home venue, club night (if you use the booking export).

## Where fixtures come from
Your source (league sites, a club spreadsheet, emails) and the rules for
turning it into `data/fixtures.yaml`: which parts may be used, which must
never be read or imported (anything holding personal data), how to read
times, and which values mean "skip" (unconfirmed, TBC, availability marks).

## Privacy blocklist
Where the member-name list comes from (kept outside the repo) and whether the
`PRIVACY_BLOCKLIST` Actions secret is set.

## Commits and merges
The commit identity to use (e.g. a GitHub no-reply address) and how to merge
without exposing a personal email.

## Deployment history
When the site went live, which settings were applied, and an open checklist.

## Decisions (dated)
Club decisions worth remembering, one line each, with the date.
