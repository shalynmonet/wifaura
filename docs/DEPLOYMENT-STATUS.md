# Deployment status

Updated November 11, 2026.

Hosting update: the primary domain will be `wifaura.sha-i.com`, with
Squarespace retaining the parent domain's DNS and all existing subdomains.
A separate Pages project `wifaura` has been created at `wifaura.pages.dev`,
and `wifaura.sha-i.com` is active on it with the single CNAME record
documented in `CUSTOM-DOMAIN.md`. The Worker URL below remains a fallback.
The owner has now saved the Squarespace CNAME; authoritative DNS, 1.1.1.1
and 8.8.8.8 confirm `wifaura.sha-i.com -> wifaura.pages.dev`. Cloudflare
domain verification and HTTPS certificate validation are active; HTTPS returned 200.
Pages production deployment `cdb652e9` (source `02ba7aa`) is published; `/`, `/auth` and
`/collective` returned HTTP 200 with the correct WIFAURA page titles.
The current `wrangler.jsonc` and default build target Pages;
`wrangler.worker.jsonc` preserves the earlier Worker configuration.

The owner authorized a public GitHub repository and Cloudflare Workers deployment.

- Public repository: `https://github.com/shalynmonet/wifaura`.
- Cloudflare Worker target name: `wifaura`.
- Backend: new project `bvnjosopyjblugshdbwd` in SHA-I; approved bootstrap applied.
- Hosted checks: zero imported collectors/artworks/WIF quotes, zero WIFAURA
  contributions, seven locked milestones, one current daily drop.
- Public app: `https://wifaura.sha-i.com`; fallback: `https://wifaura.wifaura.workers.dev`.
- Earlier Cloudflare Worker configuration is preserved in `wrangler.worker.jsonc`. Daily
  artifact, seven locked Collective milestones and private-page sign-in
  redirects were verified in a browser.
- Email sign-in is the launch method; Google is hidden until configured.
- Supabase Site URL and Redirect URLs previously used the Worker origin;
  the owner must now update them to the custom domain. A real signup or
  Google sign-in has not been exercised here.
- Earlier Worker revision: `68c22bb18573bcf8b4d6a5a965efb453ed218962`.
- Earlier Worker version: `e3b5f215-39eb-4ed5-a392-545fa0db1f2f`.
- Payments: disabled pending deployed, verified payment contract and backend.
- Complimentary launch: wallet linking and paid controls are visibly disabled.
  The protected server key and verified contract must be configured before
  enabling WIF checkout. Browser build and server payment flags both default off.
- Price: $1 USD equivalent in WIF, live quote, two-minute maximum validity.
- Treasury: `0x1fbe8ca7ab3bb424520972b6e27c0130f4971985`.

No real payment or Reserve delivery has been verified. The Solidity contract
has been tested locally. Contract deployment and a real checkout require an
approved wallet transaction; web publishing does not authorize spending funds.

The protected server key must be stored in the active Pages project's encrypted
environment settings as `SUPABASE_SECRET_KEY` (preferred) or the supported
legacy name `SUPABASE_SERVICE_ROLE_KEY` before activating wallet proofs and paid checkout.
It has not been retrieved or placed in public source. The contract must be
deployed and verified, then both browser/server payment flags enabled.

To rebuild this deployment, copy `.env.example` to ignored `.env.local`, keep
the launch flags off, run `npm ci`, `npm run build`, then `npm run deploy` after
reviewing the account and bindings in `wrangler.jsonc`. Public project URLs and
publishable keys are not secrets. Never add the server key to that file or to
any `VITE_*` variable.

NIMAURA's original repository and backend remain unchanged.
