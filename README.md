# Bramblewood Badminton Club fixtures

A static website listing all Bramblewood match fixtures, with team and home/away
filters, list and calendar views, and subscribable calendar feeds.

- **Data:** `data/fixtures.yaml`, `data/teams.yaml`, `data/venues.yaml`. See [EDITING.md](EDITING.md).
- **Build:** `scripts/build.py` validates the data and writes the site to `_site/`,
  including `calendar/<team>.ics` feeds.
- **Front end:** `site/` (plain HTML/CSS/JS, no framework). The build inlines the fixture data into `index.html`.
- **Deploy:** `.github/workflows/deploy.yml` builds on every push to `main` and
  deploys to GitHub Pages. Pull requests are validated but not deployed.
