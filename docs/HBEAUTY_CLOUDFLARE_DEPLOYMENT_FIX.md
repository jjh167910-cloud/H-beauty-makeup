# Restore automatic Cloudflare deployment for H-Beauty

**Worker:** `h-beauty`  
**Live URL:** https://h-beauty.mostifa2273.workers.dev/#/  
**GitHub repo:** `jjh167910-cloud/H-beauty`  
**Production branch:** `main`  
**Cloudflare account ID:** `a22c80a102037bf59a1a25426cb93d66`

## Reproduced cause

[GitHub Actions run 40030013001](https://github.com/jjh167910-cloud/H-beauty/actions/runs/40030013001) on 23 October 2026 was marked `success`, but **the actual Wrangler deploy step was skipped** and the "missing Cloudflare token" explanation ran. A passing build or a green workflow therefore did **not** update the Worker.

The GitHub connection and ChatGPT's Cloudflare connection do not supply `CLOUDFLARE_API_TOKEN` to GitHub Actions.

## Fix delivered by this isolated PR

This PR changes only deployment configuration and documentation. It **does not** merge the unfinished forty-makeup-image feature or publish anything.

The new workflow:
- Checks `HBEAUTY_DEPLOY_MODE` at the start (accepted values `github-actions` and `cloudflare-builds`).
- In `github-actions` mode (default), fails clearly and early if the GitHub `CLOUDFLARE_API_TOKEN` secret is absent. This prevents misleading green "deployed" runs.
- In `cloudflare-builds` mode, runs GitHub CI only; *Cloudflare Workers Builds* performs deployments via its own linked GitHub repository.
- After an authorized GitHub Actions Wrangler deployment, fetches the public H-Beauty page and checks the published `sw.js` has the **same SHA256** as the freshly built `dist/sw.js`. This catches a stale or wrong live version.
- Writes a job summary identifying which system is responsible for the public deployment.

## Option A: Recommended Cloudflare Workers Builds

1. Open [Cloudflare Workers & Pages](https://dash.cloudflare.com/?to=/:account/workers-and-pages).
2. Open the **existing** `h-beauty` Worker. Do not create a duplicate.
3. Choose **Settings → Builds → Connect**, then **GitHub**.
4. Authorize/install the Cloudflare GitHub app, selecting **`jjh167910-cloud/H-beauty`** for repository access.
5. Select branch **`main`**, root **`/`**, and deploy command **`npx wrangler deploy`**.
6. The repo's `wrangler.jsonc` declares `name: h-beauty` and automatically runs `npm run build` on deployment, serving the static `dist/` directory. Optionally make the Cloudflare *Build command* `npm ci --no-audit --no-fund && npm run verify:assets && npm run test:offline && npm run typecheck` to run verification before the Wrangler build.
7. In [GitHub repository Actions variables](https://github.com/jjh167910-cloud/H-beauty/settings/variables/actions), add a repository **variable**:
   - Name: `HBEAUTY_DEPLOY_MODE`
   - Value: `cloudflare-builds`
8. Merge this small PR to main. Future commits to `main` trigger both GitHub CI checks and a separate Cloudflare Workers Build/deployment. Check actual deployment success in the Cloudflare **Builds** tab rather than interpreting a green GitHub CI check as proof of publication.

This option does **not** need a GitHub `CLOUDFLARE_API_TOKEN` secret.

## Option B: Existing GitHub Actions + Wrangler

If you prefer GitHub Actions to be the single deployment system:

1. Open [Cloudflare Account API Tokens](https://dash.cloudflare.com/?to=/:account/api-tokens), create a restricted token with **Edit Cloudflare Workers** for the correct account.
2. In [GitHub Actions secrets](https://github.com/jjh167910-cloud/H-beauty/settings/secrets/actions), create the repository **secret** `CLOUDFLARE_API_TOKEN` and paste the token **there, not in chat or code**. The account ID is already configured in the workflow.
3. Set the GitHub Actions repository **variable** `HBEAUTY_DEPLOY_MODE` to `github-actions`, or leave it unset (default).
4. Merge this PR. Future pushes to `main` will now stop early when credentials are missing, or build, test, deploy to `h-beauty` and verify the live service-worker fingerprint if configured.
5. Confirm the **Deploy to Cloudflare Workers** and **Check public Worker after deployment** steps both succeeded.

Do **not** connect Cloudflare Builds and enable GitHub Actions deployments to the same Worker simultaneously. Choose a single publisher.

## Forty-look catalog is a separate release

The separate [draft PR #11](https://github.com/jjh167910-cloud/H-beauty/pull/11) contains the forty-look gallery, but its **80 binary WebP files are not yet committed**. Do not enable `VITE_MAKEUP_CURATED_40=true` or merge that feature until the full portrait set, SHA manifest, production build and editorial approvals are present and verified. This deployment fix is deliberately independent of those assets.

## What requires user authorization

Connecting an existing Worker to GitHub and creating a Cloudflare API token both require an account owner's explicit Cloudflare/GitHub UI authorization. Neither is automatically granted by a ChatGPT connector. An earlier account-level Worker inspection request was declined; this repair does not retry that access or claim to have configured the Cloudflare Build integration.

References:
- [Cloudflare: Connect existing Workers to Git repositories](https://developers.cloudflare.com/workers/ci-cd/builds/)
- [Cloudflare: Workers Builds configuration](https://developers.cloudflare.com/workers/ci-cd/builds/configuration/)
- [Cloudflare: GitHub Actions deployment](https://developers.cloudflare.com/workers/ci-cd/external-cicd/github-actions/)
