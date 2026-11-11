# WIFAURA deployment and acceptance

Prepared November 11, 2026. This is a separate local project, based on
`shalynmonet/nimaura` commit `02da3cd5446ca54fabdad6890800b456ff52fb6a`.
No remote repository, hosted database, contract deployment, real payment or
hackathon submission has been created by this work.

Owner selections: Cloudflare Workers hosting; WIFAURA treasury
`0x1fbe8ca7ab3bb424520972b6e27c0130f4971985`.
The address passes EVM address-format validation; ownership and receipt of
funds have not been tested. Paid unsealings cost the WIF equivalent of $1 USD at quote creation, as selected by the owner.
These selections do not authorize publishing or a contract deployment.

## Verified event and network

Official sources:

- [Hackathon rules](https://worldisflat.fun/build/rules), including the page's
  [published copy](https://worldisflat.fun/build/assets/js/copy.js).
- [Live event data](https://worldisflat.fun/build/api/event).
- [World Is Flat token address](https://worldisflat.fun/).
- [Robinhood Chain connection documentation](https://docs.robinhood.com/chain/connecting/).

The event accepts existing projects with meaningful onchain WIF use. It requires
a reviewable repository, demo video, real transactions and a working live app
through the final. The experience must give people a reason to return. Teams
have at most four members; participants must be adults. WIFAURA's daily art and
cumulative Collective milestones provide its return loop. Token burning is part
of hackathon voting; it is not a mandatory WIFAURA checkout behavior.

The official event API reports submission close November 12, 2026, 17:30 UTC
(11:30 AM America/Chicago). The final closes November 16 at the same time.
Recheck the event API before submitting because organizers may extend dates.
The hackathon is independent of Robinhood Markets. Use WIFAURA's own branding.

| Setting | Verified value |
| --- | --- |
| Mainnet chain ID | 4663 (`0x1237`) |
| Public RPC | `https://rpc.mainnet.chain.robinhood.com` |
| Gas token | ETH |
| Explorer | `https://robinhoodchain.blockscout.com` |
| WIF token | `0x5173b8eA6923c2d40267890D45C46a3480954773` |
| WIF decimals | 18, confirmed by `eth_call` |
| Testnet chain ID | 46630; no official testnet WIF assumed |

Public RPC reads confirmed chain ID, symbol WIF and decimals 18. These reads
are not proof of a WIFAURA payment. Mock tokens and local EVM tests are not
submission transaction evidence.

## Isolation and architecture

The clone has no Git remote. Its copied `.env` has been replaced with disabled
payment settings and no inherited backend credentials. Browser startup, server
requests and the new service client explicitly reject the original Supabase
hostname. All new payment state uses `wif_*` tables. Use a **new, empty backend**;
do not copy NIMAURA's users, credits, purchases or contributions.

Inherited generated clients and historical migrations remain unchanged. The
WIFAURA-specific schema is in `database/wifaura.sql`, prepared locally with the
user's explicit authorization. This file replaces the Collective counter only
inside the new backend and disables inherited Nimiq/simulated fulfillment APIs.
Historical Nimiq files remain for provenance and regression coverage; the live
WIFAURA routes use `src/lib/wif` and `WifPaymentPanel`.

The original used server-side Nimiq ownership challenges, quoted NIM payments,
canonical-finality verification and atomic issuance. Reserve allocation entered
a separate treasury payout queue. The new checkout moves both halves in a
single ERC-20 transaction, avoiding an unpaid Reserve liability.

1. An authenticated collector proves each EOA wallet with a short-lived, one-use
   signed message bound to origin, user, chain and payer/Reserve purpose.
2. A service-only database function snapshots the payer, separate Reserve,
   $1-equivalent WIF amount, rate/source/time, art seed, intention, router, treasury and drop window. Quotes expire two minutes after the observed rate or when the drop closes, whichever is earlier.
3. The wallet approves exactly the quoted token amount. Approval is not payment.
4. The server checks the allowance and durably marks the quote pending **before**
   the browser requests payment. Double clicks cannot reopen that quote.
5. `WifauraPayments.pay` transfers 50% directly to Reserve and 50% to the
   immutable treasury, checks exact balance increases, and emits `Paid`.
6. The server verifies the chain, pinned contract code, token/treasury getters,
   successful receipt, payer, canonical block, finalized head, quote timing and
   exact event fields. It rereads the canonical block before fulfillment.
7. A service-only SQL transaction issues one collectible and records one unique
   transaction. Replays return the original result. The same transaction cannot
   fulfill another quote.
8. The Collective count is independently `wifaura`, cumulative at 100, 250, 500,
   1,000, 2,500, 5,000 and 10,000. A unique user/drop contribution prevents free
   and paid redemptions from double counting. Locked milestone content stays
   behind the existing privacy-safe public function.

Quote IDs encode their immutable deadline in the first eight bytes and contain
24 random bytes. The contract rejects any alternate deadline. Replay flags are
scoped by payer, preventing another wallet from consuming a collector's quote
ID. There is no intention or user identifier in the onchain event.

Interrupted payments recover by indexed quote/payer event lookup or a pasted
transaction hash. Verification never sends funds. Cancellation alone never
unlocks another payment. Explicit expiry release requires a canonical finalized
block after the encoded deadline and proof that this payer/quote was unused.
Because the deadline is part of the quote ID, delayed transactions cannot later
succeed for an expired quote. There is no automatic resend.

## Local validation

Use Node 24 and the committed npm lockfile:

```sh
npm ci
npm run typecheck
npm test
npm run contracts:compile
npm run contracts:test
npm run build
```

The contract harness creates an in-process disposable EVM, generates test
accounts in memory and never opens a public RPC or submits real transactions.
Ganache may report that its optional native WebSocket module is unavailable on
Node 24; its JavaScript fallback is used for these tests. Keep the harness out
of the production runtime. See `VALIDATION.md` for actual results and limits.

## Deployment procedure — requires approval before external changes

1. The owner selected $1 USD paid in WIF and the treasury recorded above. The payer, Reserve and treasury must be distinct. The server uses a live rate and rounds up by less than two token base units for an exact equal split. ETH gas is additional. There is no fixed-WIF override or remembered-rate fallback.
2. With approval, create a separate `shalynmonet/wifaura` remote and a new
   Cloudflare Worker named `wifaura`. Never reconnect this copy to NIMAURA's
   Lovable project. Retain the MIT attribution in `LICENSE`.
3. With approval, create a new Supabase backend. Apply inherited
   `drizzle/migrations/*.sql` in numeric order, then `database/wifaura.sql`,
   using the SQL owner. This is a fresh-bootstrap sequence, not an upgrade for
   an existing app. Configure email/password auth, permitted redirect URLs and
   optional Google OAuth on this new backend. Do not run migrations against the
   original project. Confirm empty WIFAURA contributions and users afterward.
4. The inherited seed creates daily drops starting November 1, 2026. Confirm a
   current drop exists and that future daily drops cover the judging window.
   Add future drops through the new project's administrator, using the existing
   entity and private-content rules. Do not reset prior art snapshots.
5. Compile the contract. Review constructor arguments: official mainnet WIF
   token above and the owner's treasury. With explicit transaction approval,
   deploy `contracts/artifacts/WifauraPayments.json` using the owner's wallet
   tooling on chain 4663. ETH is needed for gas. No private key belongs in this
   repository or this chat.
6. Verify contract source on Blockscout with Solidity 0.8.30, optimizer enabled,
   200 runs, EVM target Shanghai and the exact constructor arguments. The
   contract has no admin, upgrade or withdrawal functions; incorrect immutable
   configuration requires a new deployment.
7. Copy `.env.example` to ignored `.env.local`. Set the new backend URL and
   publishable key in both browser (`VITE_*`) and server settings. Store the
   service-role key only in server secrets. Set origin, deployed contract and
   treasury addresses. Leave payments disabled. Do not use `NIMIQ_*` secrets.
8. Run `npm run deployment:check`. It performs read-only chain checks, compares
   deployed runtime to compiled source after masking immutable slots, verifies
   chain/token/treasury/decimals and prints `WIFAURA_ROUTER_CODE_HASH`. Configure
   that hash on the server. Never pin a hash from an unverified contract.
9. Confirm live pricing works on the deployed server. Configure `WIFAURA_PAYMENTS_ENABLED=true` only
   after the contract and separate backend checks pass. Production origin must
   be the app's exact HTTPS origin. `VITE_*` settings are build-time values:
   rebuild after changing them. Publish requires explicit owner approval.
10. With explicit approval for the exact amount and gas, execute one small real
    WIF checkout. Record approval hash separately from payment hash. Check both
    Reserve and treasury balance changes and explorer transfer logs. Verify the
    collectible appears once, Reserve history shows the delivered half, and
    Collective increases once. Retry verification and refresh; totals must not
    change. Never describe this step as completed without transaction evidence.
11. Keep the app live through the final, record a demo, and ask before submitting
    the project. If the repo is private, invite the official `wifonrh` account
    only with approval. Include real payment links, source revision, live URL,
    clear WIF utility and the daily/Collective return loop.

## Hosting notes

The inherited TanStack Start build targets Cloudflare through Nitro. `npm run
build` emits `.output/public`, the bundled worker and its generated Wrangler
configuration. Configure secrets on a new Worker and review generated worker
name/account before any publish command. Do not run a generic deploy command
while an original account/project could still be selected. A new Lovable
project may import the separate GitHub repo after it exists; configure its own
backend and secrets there.

An end-to-end hosted auth, mobile wallet, real finalized WIF payment and
deployment smoke test remain mandatory acceptance steps. Current EOA signing
supports injected EVM wallets; smart-contract accounts/EIP-1271, WalletConnect
QR and mobile deep links are not implemented. The public RPC's `finalized` tag
is required: do not replace it with an arbitrary confirmation count. A provider
without finalized-history support keeps issuance pending. Broad recovery log
queries may require an indexed RPC or an explicit payment hash.

Disabling new payments is a server flag; existing onchain assets and payments
are permanent. Retain receipt evidence and reconcile unresolved quotes before
changing the contract or treasury configuration.

## $1 pricing source and limits

Pricing uses the documented [DEX Screener pair API](https://docs.dexscreener.com/api/reference)
for the pinned [WIF/ETH market](https://dexscreener.com/robinhood/0x71ef4106340f0a3b9c19ec994eef4fc44a1d2513f38faac39d7636b156548c79).
Live read-only checks confirmed this pool reports the exact WIF token on
`robinhood`. The server verifies chain, token, pool and quote currency, requires
at least $10,000 reported liquidity and activity in the five-minute window,
and rejects response dates/cache ages over 60 seconds. HTTP errors, redirects,
invalid prices and outages do not fall back to an old or fixed rate.

This is a third-party spot-price service, not an independent onchain price
oracle or a stable-value guarantee. Its response date establishes response
freshness; it does not cryptographically prove the indexer's underlying trade
timestamp. WIF's dollar value can change after quoting. Each accepted quote
locks its exact WIF amount and stores its rate, source and observation time;
payment verification and recovery never require another market-price request.
