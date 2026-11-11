# Deployment status

Updated November 11, 2026.

The owner authorized a public GitHub repository and Cloudflare Workers deployment.

- Public repository: `https://github.com/shalynmonet/wifaura`.
- Cloudflare Worker target name: `wifaura`.
- Backend: new project `bvnjosopyjblugshdbwd` in SHA-I; approved bootstrap applied.
- Hosted checks: zero imported collectors/artworks/WIF quotes, zero WIFAURA
  contributions, seven locked milestones, one current daily drop.
- Public app: `https://wifaura.wifaura.workers.dev`.
- Cloudflare Worker deployed using `wrangler.jsonc`. HTTPS is active; daily
  artifact, seven locked Collective milestones and private-page sign-in
  redirects were verified in a browser.
- Email sign-in is the launch method; Google is hidden until configured.
- Owner action pending: set Supabase Site URL and Redirect URLs to the public
  app origin, then verify a real signup/confirmation/sign-in.
- Payments: disabled pending deployed, verified payment contract and backend.
- Complimentary launch: wallet linking and paid controls are visibly disabled.
  The protected server key and verified contract must be configured before
  enabling WIF checkout. Browser build and server payment flags both default off.
- Price: $1 USD equivalent in WIF, live quote, two-minute maximum validity.
- Treasury: `0x1fbe8ca7ab3bb424520972b6e27c0130f4971985`.

No real payment or Reserve delivery has been verified. The Solidity contract
has been tested locally. Contract deployment and a real checkout require an
approved wallet transaction; web publishing does not authorize spending funds.

The protected server key must be stored as a Cloudflare secret named
`SUPABASE_SERVICE_ROLE_KEY` before activating wallet proofs and paid checkout.
It has not been retrieved or placed in public source. The contract must be
deployed and verified, then both browser/server payment flags enabled.

To rebuild this deployment, copy `.env.example` to ignored `.env.local`, keep
the launch flags off, run `npm ci`, `npm run build`, then `npm run deploy` after
reviewing the account and bindings in `wrangler.jsonc`. Public project URLs and
publishable keys are not secrets. Never add the server key to that file or to
any `VITE_*` variable.

NIMAURA's original repository and backend remain unchanged.
