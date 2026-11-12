# Deployment status

Updated November 12, 2026.

Sponsor RPC integration is live on Pages deployment
`70d2484e.wifaura.pages.dev`: QuickNode primary, GetBlock backup, Alchemy final
fallback. Both sponsors independently passed pinned-contract and finalized
phone-payment verification at block 112607099. Active checkout configuration
and fresh pricing passed after deployment (16:26 UTC). Fifteen targeted RPC,
verification and health tests, type checking, lint and production build passed.
Credentials remain encrypted Cloudflare Pages Production secrets. Wallet sends
never use read fallback. See [provider integration](RPC-PROVIDERS.md) and
[public verification evidence](../deployments/rpc-providers.json).

WIFAURA is live at https://wifaura.sha-i.com on Cloudflare Pages. Source is public
at https://github.com/shalynmonet/wifaura. The owner approved opening paid checkout
after the complete iPhone payment test passed. Verified payer and separate Reserve
wallets are still required. Each paid unsealing costs a live $1-equivalent WIF quote.

NIMAURA's repository and backend remain unchanged. WIFAURA uses its own SHA-I
Supabase project, bvnjosopyjblugshdbwd. Google sign-in works. Squarespace retains
its original nameservers; only the wifaura CNAME points to Pages. Use the primary
domain for payments; the older workers.dev deployment is a complimentary fallback.

## Accepted phone payment

The owner completed connection, network setup, WIF approval and payment on an
iPhone using MetaMask, then confirmed the collectible opened after finality.

- Transaction: 0xee1a9c7b57ae4643da3d38e518ffb4fd11585cc8e88049a19e46514f74167be3
- Amount: 814.995925020374898126 WIF, quoted at $0.001227/WIF for $1.00.
- Reserve delivered: 407.497962510187449063 WIF.
- Treasury delivered: 407.497962510187449063 WIF.
- Inclusion: block 112607099, November 12 at 14:44:54 UTC, within the quote window.
- Finality independently observed at checkpoint 112608079.
- App fulfillment: 15:02:40 UTC; exactly one collectible and one Collective contribution.
- Collective total increased from 1 to 2; all seven locked milestone names remain hidden.
- Complimentary credit remained 1. An already-fulfilled duplicate call was tested
  inside a rolled-back transaction: same artifact and receipt, no duplicate contribution.

The independent verification checks successful receipt, sender, destination,
exact Paid event and both ERC-20 transfers, canonical block hash, finalized
coverage, immutable runtime hash and a final canonical reread. See
[public payment evidence](../deployments/phone-checkout.json).

## Verified contract

- Robinhood Chain mainnet: 4663; ETH pays gas.
- Contract: 0x2d889Ff462B21177A4C2E6384D258eC867222D69
- WIF: 0x5173b8eA6923c2d40267890D45C46a3480954773; 18 decimals.
- Treasury: 0x1fbe8ca7ab3bb424520972b6e27c0130f4971985
- Runtime hash: 0x4bdfd605b0c3ba7414344ccdb5290cde5e0862eb570ace6e43edd5f7821419b4
- Source verified on Blockscout. Deployment is finalized.

Token and treasury are immutable. Payment atomically transfers half directly to
the verified Reserve and half to treasury. There is no app-held withdrawal key.
See [contract setup](CONTRACT-SETUP.md) and
[deployment evidence](../deployments/robinhood-mainnet.json).

## Production connections and safeguards

SUPABASE_SECRET_KEY and WIFAURA_PRIVATE_RPC_URL are encrypted Pages Production
secrets. Their values were not retrieved or committed. Alchemy is used for the
private chain connection because the shared public endpoint throttled requests.
WalletConnect calls explicitly target the session's authorized chain 4663;
missing or revoked authorization fails closed. Phone pairing offers app links
for MetaMask and Robinhood Wallet. Every mobile signing/transaction request
provides an app handoff; returning to the browser never resends it.

Pricing uses the pinned DEX Screener WIF/ETH pool through the protected wif-market
Edge Function v2 in WIFAURA's backend. The function accepts a project secret API
key using @supabase/server 1.9.2; unauthenticated calls return 401. It fetches one
fixed URL, performs no database work, stores no rate, and preserves provider Date
and Age. All token, pool, chain, liquidity, activity and freshness checks remain
in force. A single bounded retry is allowed for transient network/5xx failures;
403/429 are not retried. Public health probes expose no credentials or user data.

Paid issuance requires canonical finalized evidence. Pending purchases never
reopen automatically; Check payment never sends funds. Separate Collective
progress is deduplicated per collector and drop. Phone account setup provides
explicit reconnection so paying and Reserve accounts can be verified separately.

## Validation and remaining submission work

The real phone payment, exact split, finalized issuance, credit preservation,
Collective projection and duplicate-fulfillment checks passed. Relevant wallet,
network, checkout, pricing/relay and disposable-EVM contract tests, type checks,
lint and production builds passed. Daily drops are seeded through March 1, 2027.

The submission draft is prepared; no hackathon entry has been submitted. The demo
video remains outstanding. Official event data checked November 12 gives a
submission deadline of 17:30 UTC / 11:30 a.m. Chicago today, with the final ending
November 16 at the same time. Sources: https://worldisflat.fun/build/rules and
https://worldisflat.fun/build/api/event.

Public launch verified: Pages deployment 45f81136-640e-4637-b6a9-4d377db5d705, paid-checkout flag true, empty test-payer restriction, Google enabled, signup enabled, both protected settings still encrypted, primary HTTPS status 200 and fresh pricing available. Thirty targeted public-access/wallet/onboarding/checkout tests plus type checks and build passed. See deployments/public-launch.json.

