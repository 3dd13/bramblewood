# Deployment

> **Status:** Decision **accepted** (§1). Pipeline changes in §3 are **proposed, not implemented yet**.
> The site has not been published. No GitHub repository exists yet.

## 1. Decision: source on `main`, build output never committed

| What | Where |
|---|---|
| Fixture data (`data/`) | `main` branch |
| Site source (`site/`, `scripts/`) | `main` branch |
| Built site (`_site/`) | **Not committed anywhere.** Built by GitHub Actions on every push and uploaded as a Pages artifact. |
| Publishing source | GitHub Pages → **"GitHub Actions"** (not "Deploy from a branch") |

No `gh-pages` branch and no `/docs` folder.

### Why

- **GitHub's own guidance.** GitHub offers two publishing sources: deploy from
  a branch, or a GitHub Actions workflow. It suggests Actions when the site
  uses a build tool other than Jekyll, or when you don't want to keep compiled
  files on a branch. Both apply here: `scripts/build.py` generates
  `index.html` and the `.ics` feeds.
- **No generated files in git.** Committing `_site/` would duplicate `data/`,
  let the two drift apart, and add noisy diffs to every fixture edit. With
  Actions, every deploy is a fresh, reproducible build of `main`.
- **A `gh-pages` branch is a workaround** for external CI tools that can only
  publish by pushing commits. It isn't needed when Actions can upload an
  artifact directly.
- **Privacy is unaffected either way.** A Pages site is public even if the
  repository is private, so the rules in [AGENTS.md](AGENTS.md) are the real
  safeguard, not repository visibility.

### Options considered

| Option | Verdict |
|---|---|
| Commit `_site/` to `main` (root or `/docs`), deploy from branch | ✗ Generated files in source control, drift, and noisy history |
| Build in CI, push output to a `gh-pages` branch | ✗ Extra branch and write token for no benefit; the older pattern |
| **Build in CI, deploy the artifact with `actions/deploy-pages`** | ✓ Chosen |
| Cloudflare Pages / Netlify | Not now. Their main advantage is per-PR preview URLs. Worth revisiting only if previews become important. |

## 2. Current pipeline (`.github/workflows/deploy.yml`)

```
push to main ─► build job: pip install → build.py (validates + builds) → upload-pages-artifact
                   └─► deploy job (main only): deploy-pages → https://3dd13.github.io/bramblewood/
pull request ─► build job only (validation, no deploy)
```

Permissions: `contents: read`, `pages: write`, `id-token: write`. No secrets are used.

## 3. Proposed changes (not implemented)

### 3.1 Workflow
1. Upgrade `actions/upload-pages-artifact` **v3 → v4**, and add `actions/configure-pages@v5` before the build, following GitHub's current guidance.
2. Split the work into three jobs:
   ```
   test  ─► build ─► deploy (main only)
   ```
   `deploy` needs `test` and `build`, so a failing test blocks the release. See [TESTING.md](TESTING.md).
3. **Pin every action to a full commit SHA** (with the version as a comment) instead of a moving tag like `@v4`.
4. Add **Dependabot** (`.github/dependabot.yml`) for `github-actions` and `pip`, checking weekly.

### 3.2 Repository settings (when the repo is created)
1. **Pages source:** "GitHub Actions".
2. **`github-pages` environment:** limit deployment branches to `main`.
3. **Branch protection on `main`:** require the `test` and `build` checks to pass before merging a PR.
   - Edits made directly on github.com still commit to `main`. Protection doesn't block
     those, but a failing check still stops the deploy, so the live site stays safe.
4. Keep the default `GITHUB_TOKEN` permissions read-only.

### 3.3 Previews
GitHub Pages has no per-pull-request preview deployments. Instead:
- CI tests on the PR, including Playwright screenshots attached to the run (see [TESTING.md](TESTING.md) §4).
- Local preview: `python scripts/build.py && python3 -m http.server -d _site`.

## 4. Going live checklist (when approved)

- [ ] `gh auth login`, then create `3dd13/bramblewood` (public; Pages on a private repo needs GitHub Pro)
- [ ] Push `main`
- [ ] Settings → Pages → Source: **GitHub Actions**
- [ ] Environment and branch protection rules from §3.2
- [ ] First deploy succeeds, and the site and `.ics` feeds load at `https://3dd13.github.io/bramblewood/`
- [ ] Subscribe to one feed in Google and Apple Calendar to confirm it works

## References
- [GitHub Docs: Configuring a publishing source for your GitHub Pages site](https://docs.github.com/en/pages/getting-started-with-github-pages/configuring-a-publishing-source-for-your-github-pages-site)
- [GitHub Docs: Using custom workflows with GitHub Pages](https://docs.github.com/en/pages/getting-started-with-github-pages/using-custom-workflows-with-github-pages)
