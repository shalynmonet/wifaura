# Robinhood Chain provider integration

QuickNode is the primary server-side JSON-RPC provider. GetBlock is the next
provider when a read fails, followed by the existing Alchemy endpoint. The
production switch is `WIFAURA_SPONSOR_RPC_ENABLED=true`.

Configure full authenticated HTTPS URLs as encrypted Cloudflare Pages Production
secrets named `QUICKNODE_RPC_URL`, `GETBLOCK_RPC_URL`, and
`WIFAURA_PRIVATE_RPC_URL` (Alchemy). Redeploy after changing secrets. Never put
these URLs in client variables, source, screenshots, or public evidence files.
QuickNode's URL must include its auth token after the base URL.

Each provider is checked for chain ID 4663 before business reads. Only explicitly
listed read methods can use fallback. Neither raw transaction broadcast nor
wallet signing is permitted through this server transport. The user wallet sends
each transaction separately; an uncertain payment stays pending for verification.
Provider failures are sanitized before reaching clients.

## Independent verification

On November 12, 2026, each sponsor independently verified the pinned runtime hash
of contract `0x2d889Ff462B21177A4C2E6384D258eC867222D69` and the real phone
payment `0xee1a9c7b57ae4643da3d38e518ffb4fd11585cc8e88049a19e46514f74167be3`
at canonical block 112607099. Verification uses the existing payment verifier:
successful receipt, quoted payer and contract, exact payment and split events,
canonical block, finalized checkpoint coverage, and a final canonical reread.
The sponsors verified the historical payment after integration; they were not
the providers used for its original issuance.

Fixed public read-only probes are available at `/api/rpc-providers/quicknode`
and `/api/rpc-providers/getblock`. They accept no caller-selected method, URL,
address, or payload, and cache results for 60 seconds. Responses contain provider
labels and public evidence only. `/api/chain-health` verifies the active checkout
configuration and lists configured fallback order.

Targeted tests cover primary read failure, independent chain validation for the
backup, wrong-chain rejection, prohibited transaction broadcast, and credential
redaction. Individual live probes establish both endpoints' ability to verify
the payment; no production outage was induced to test fallback.

Contract deployment, wallet behavior, pricing, Reserve allocation, and separate
Collective progression are unchanged. Integration does not imply endorsement or
sponsor-prize eligibility.
