# WIFAURA

A separate Robinhood Chain edition of NIMAURA: daily generative art, verified
WIF checkout, an atomic 50% Reserve transfer and independent Collective Seal
progression. Based on NIMAURA commit `02da3cd5446ca54fabdad6890800b456ff52fb6a`.

**Deployment in progress.** Payments default off. WIFAURA must use a new backend
and new deployment. Never connect it to the
original NIMAURA project.

Public source: https://github.com/shalynmonet/wifaura
See [current deployment status](docs/DEPLOYMENT-STATUS.md) for live-service readiness.

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
