# WIFAURA

A separate Robinhood Chain edition of NIMAURA: daily generative art, verified
WIF checkout, an atomic 50% Reserve transfer and independent Collective Seal
progression. Based on NIMAURA commit `02da3cd5446ca54fabdad6890800b456ff52fb6a`.

**Live app:** https://wifaura.sha-i.com

Primary domain: `https://wifaura.sha-i.com`, hosted on
Cloudflare Pages at `https://wifaura.pages.dev`. Squarespace retains DNS.
See [the single-record DNS setup](docs/CUSTOM-DOMAIN.md).

The payment contract is deployed and source-verified; its runtime hash and
protected server key are configured. The complete iPhone checkout passed: finalized WIF payment, equal Reserve/treasury transfers, one collectible and one Collective contribution. Paid checkout is open to verified collectors following owner approval.
WIFAURA uses a separate backend and deployment; never connect
it to the original NIMAURA project.

Public source: https://github.com/shalynmonet/wifaura
See [current deployment status](docs/DEPLOYMENT-STATUS.md) for live-service readiness.

Server-side Robinhood Chain reads use QuickNode first, GetBlock as backup, and
Alchemy as the final fallback. Each provider must report chain 4663 before it
can supply payment evidence. Both sponsors independently verified the deployed
contract and the finalized phone payment. Endpoint credentials stay in encrypted
Cloudflare secrets; wallet transaction requests are never sent through this
fallback mechanism. See [provider setup and evidence](docs/RPC-PROVIDERS.md).

```sh
npm ci
npm run typecheck
npm test
npm run contracts:test
npm run build
```

Configure a separate backend using `.env.example` before running `npm run dev`.

- [Deployment, official requirements and architecture](docs/WIFAURA-DEPLOYMENT.md)
- [Validation evidence and remaining acceptance steps](docs/VALIDATION.md)
- [Hackathon submission and demo draft](docs/HACKATHON-SUBMISSION.md)
- [Payment contract](contracts/WifauraPayments.sol)
- [New backend schema](database/wifaura.sql)

No remote creation, deployment, real transaction or submission is authorized by
running local tests. Obtain the owner's approval for each external change.
The original MIT attribution is retained in `LICENSE`.


