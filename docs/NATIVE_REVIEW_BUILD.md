# Native Cloudflare research preview

The production Worker `h-beauty-makeup` and its Git integration remain unchanged.
The dedicated review Worker is `h-beauty-makeup-review`; its config is
`wrangler.preview.jsonc`. Use the existing Cloudflare Workers Builds GitHub
connection, not a second production token.

## Current implementation

`node scripts/bench/check_native_review.mjs` is a tokenless preflight for a
native build of `quality/integrated-review-20261126`. Cloudflare supplies
`WORKERS_CI_BRANCH` and `WORKERS_CI_COMMIT_SHA`. The script checks the actual Git
checkout, isolated Worker configuration and latest exact-head pull-request
runs of all five required validation workflows plus the review artifact build.
Missing, failed, pending, stale, or inaccessible evidence stops the build.

The public GitHub REST API can supply workflow metadata without credentials.
This does not make the Actions artifact archive anonymously downloadable.
Do not replace the full offline artifact with an ordinary Vite build: it would
omit the generated 48-style atlas and the actual GPU comparison gallery.

## Remaining connection and artifact delivery requirements

1. In Workers Builds, use a separate review Worker, connect the existing GitHub
   repository, and restrict the deployment branch to the dedicated review
   branch. Never change the production Worker's settings or bindings.
2. Run the native review preflight before any deploy. If triggered before CI
   completes, the build must stop; retry only once the exact head is green.
3. Supply the exact validated offline dist artifact through an authorized
   delivery mechanism; validate provenance and integrity before deploying.
   The existing GitHub Actions artifact is available for signed-in review.
   A tokenless artifact delivery mechanism is not yet implemented.
4. Only after these requirements are met, use
   `npx wrangler deploy --config wrangler.preview.jsonc` for the review Worker.
   Verify stage headers, review gallery, and 404 on salon API routes.

Do not configure a production deploy command or deploy a plain build to the
review Worker. The preflight does not itself generate assets or publish a URL.

Cloudflare reference:
https://developers.cloudflare.com/workers/ci-cd/builds/configuration/
