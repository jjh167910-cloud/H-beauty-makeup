# Native Cloudflare research preview

Production Worker `h-beauty-makeup` remains unchanged. Review Worker:
`h-beauty-makeup-review`. No additional Cloudflare API credentials are needed
for native Workers Builds.

## Cloudflare dashboard (review Worker only)

- Git repository: `jjh167910-cloud/H-beauty-makeup`
- Production branch of **review Worker only**: `quality/integrated-review-20261126`
- Root directory: `/`
- Build command: `node scripts/bench/fetch_native_review.mjs`
- Deploy command: `npx wrangler deploy --config wrangler.preview.jsonc`
- Non-production branch builds: disabled.

Workers Builds provides WORKERS_CI_BRANCH and WORKERS_CI_COMMIT_SHA. Do not
override them. Use Node 22 or later.

## Publication protocol

The PR workflow builds public catalog-only assets and checks that the tested
merge tree is identical to the exact PR head. The second job waits for all
five independent exact-head workflows to succeed. It publishes a distinct
public GitHub prerelease named `hbeauty-review-<40-character SHA>`, with
the complete dist tarball and its SHA256. Only the integrated review branch
may publish the package; it never overwrites an existing release.

The native build script verifies the dedicated branch and configuration,
actual Git HEAD, all six latest exact-head PR checks, GitHub release identity,
asset metadata/digest, checksum, size, safe archive paths and embedded SHA.
It restores the exact packaged dist, not an ordinary Vite rebuild.
On any failure it exits nonzero. No Cloudflare token is passed into Actions.

**Before clicking Deploy:** wait for all six checks and the public prerelease
to be available for the current head. A Git-triggered build that starts
before the package is ready will fail closed; retry that same commit after CI
has finished. Never bypass this safeguard by deploying an ordinary Vite build.

After deployment verify x-hbeauty-stage: research-preview, the embedded
/research-preview/REVIEW_SHA.txt, the gallery at /research-preview/index.html,
and HTTP 404 at /api/chat. No production salon data is attached.

This is experimental review, not production acceptance. The public package
publication and Cloudflare restoration must be verified end to end.

Cloudflare documentation:
https://developers.cloudflare.com/workers/ci-cd/builds/configuration/
