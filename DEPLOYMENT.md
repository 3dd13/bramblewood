# Deployment

> **Status:** the pipeline is implemented (`.github/workflows/ci.yml`). The site
> has **not been published yet**, because the GitHub repository doesn't exist
> yet. See §4.

## 1. Decision: source on `main`, build output never committed

| What | Where |
|---|---|
| Fixture data (`data/`) | `main` branch |
| Site source (`site/`, `scripts/`) | `main` branch |
| Built site (`_site/`) | **Not committed anywhere.** Built by GitHub Actions on every push and uploaded as a Pages artifact. |
| Publishing source | GitHub Pages → **"GitHub Actions"** (not "Deploy from a branch") |

No `gh-pages` branch and no `/docs` folder.

### Why
- **GitHub's guidance.** Pages can publish from a branch or from a GitHub
  Actions workflow. GitHub suggests the workflow when the site uses a build
  tool other than Jekyll, or when you don't want compiled files on a branch.
  Both apply here: `scripts/build.py` generates `index.html` and the `.ics` feeds.
- **No generated files in git.** Committing `_site/` would duplicate `data/`,
  let the two drift apart, and add noisy diffs to every fixture edit. Every deploy is a fresh build of `main`.
- **A `gh-pages` branch is a workaround** for CI tools that can only publish by pushing commits. It isn't needed here.
- **A private repo wouldn't protect anything:** a Pages site is public even if the
  repo is private. The rules in [AGENTS.md](AGENTS.md) are the real safeguard.

### Options considered

| Option | Verdict |
|---|---|
| Commit `_site/` to `main` (root or `/docs`), deploy from branch | ✗ Generated files in source control, drift, and noisy history |
| Build in CI, push output to a `gh-pages` branch | ✗ Extra branch and write token for no benefit |
| **Build in CI, deploy the artifact with `actions/deploy-pages`** | ✓ Chosen |
| Cloudflare Pages / Netlify | Not now. Their main advantage is per-PR preview URLs. |

## 2. Pipeline

```
push / pull request
 ├─ checks  : validate data → pytest (build, ICS, privacy guard) → build _site → privacy guard
 │            → lychee link check → upload Pages artifact (main only)
 ├─ e2e     : Playwright behaviour + visual + accessibility + smoke → report artifact
 └─ deploy  : main only, needs checks + e2e → actions/deploy-pages → https://3dd13.github.io/bramblewood/
```

| Workflow | Trigger | Purpose |
|---|---|---|
| `ci.yml` | push to `main`, pull requests, manual | Test everything; deploy from `main` |
| `update-screenshots.yml` | manual, on a branch | Regenerate Linux screenshot baselines (TESTING.md §4) |
| `.github/dependabot.yml` | weekly | Update pinned actions, pip and npm test tools (grouped PRs) |

### Security measures
- **Minimal permissions:** the workflow default is `contents: read`. Only the
  `deploy` job gets `pages: write` + `id-token: write` (OIDC, no stored deploy
  token). `checks` gets `pages: read` to configure Pages.
- **Every action is pinned to a full commit SHA** with the version in a comment.
  Dependabot keeps the pins up to date.
- `actions/checkout` runs with `persist-credentials: false` in the CI jobs.
- **The only secret** is the optional `PRIVACY_BLOCKLIST` (member names for the
  privacy guard). It's never printed, and pull requests from forks don't get it,
  so only the name check is skipped there.
- **Deploy concurrency** group `pages` without cancelling, so a deploy is never
  cut off halfway. Superseded PR runs are cancelled.
- The `github-pages` environment is limited to `main` (see §3).

## 3. Repository settings (when the repo is created)

1. **Settings → Pages → Source:** "GitHub Actions".
2. **Settings → Environments → `github-pages`:** deployment branches → `main` only.
3. **Settings → Branches → rule for `main`:** require the status checks
   `Data, unit tests, privacy, links` and `UI, visual and accessibility tests (Playwright)`.
   - Edits made directly on github.com still commit to `main`. Protection doesn't
     block them, but a failing check stops the deploy, so the live site stays safe.
4. **Settings → Actions → General:** workflow permissions "Read repository
   contents" (the default). Allow GitHub Actions to create PRs: off.
5. **Settings → Secrets and variables → Actions:** add `PRIVACY_BLOCKLIST`
   (one member name per line), taken from the club spreadsheet. Don't keep a copy in the repo.
6. **Settings → Code security:** enable Dependabot alerts and secret scanning with push protection.

## 4. Going live checklist

- [ ] `gh auth login`, then create `3dd13/bramblewood` (public; Pages on a private repo needs GitHub Pro)
- [ ] Final audit: `git ls-files` contains only needed files, and there's no sensitive data in the history (see AGENTS.md)
- [ ] Push `main`. The first run's Playwright job fails on missing Linux screenshot baselines. That's expected, and nothing deploys.
- [ ] Settings from §3 (Pages source, environment, secret, security features)
- [ ] Create a branch, run **Actions → Update screenshot baselines** on it, review the images, open a PR, and merge once green
- [ ] The merge deploys. Check the site and `.ics` feeds at `https://3dd13.github.io/bramblewood/`
- [ ] Enable branch protection (§3.3) once the check names have appeared at least once
- [ ] Subscribe to one feed in Google and Apple Calendar to confirm it works

## Previews
GitHub Pages has no per-PR preview deployments. For review, use the Playwright
report artifact (a screenshot of every page state) or a local preview:
`python scripts/build.py && python3 -m http.server -d _site`.

## References
- [GitHub Docs: Configuring a publishing source for your GitHub Pages site](https://docs.github.com/en/pages/getting-started-with-github-pages/configuring-a-publishing-source-for-your-github-pages-site)
- [GitHub Docs: Using custom workflows with GitHub Pages](https://docs.github.com/en/pages/getting-started-with-github-pages/using-custom-workflows-with-github-pages)
