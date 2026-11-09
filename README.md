# H-beauty-makeup — staging repository

This is an **isolated preview destination**, not the production H-Beauty website.

The repository was initially created with a README only. The V14 FULL application archive and its binaries have **not been imported here**. The staging workflow detects that state and does not claim to have deployed the application.

After the complete V14 source and public assets are added, the workflow checks application assets, regression tests, TypeScript, and the Vite production build. It then uploads the built artifact. It may publish only the dedicated Cloudflare Worker **h-beauty-makeup**, provided this repository has valid `CLOUDFLARE_API_TOKEN` and `CLOUDFLARE_ACCOUNT_ID` secrets and the assets satisfy the account's file-size limits.

**Never point the staging Worker at the existing `h-beauty` production Worker.** V14's neural research utilities are experimental and do not constitute a validated photographic makeup model. Actual mobile/browser visual quality still requires independent verification.
