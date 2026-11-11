# Validation record

November 11, 2026. All tests below run locally against this separate WIFAURA
copy. Original NIMAURA remote history and hosted data have not been changed.

## Verified locally

| Check | Result |
| --- | --- |
| Full test suite | 25 files, 208 tests passed |
| After $1 pricing change | 15 targeted pricing, database, receipt and UI tests passed |
| TypeScript | `npm run typecheck` passed |
| Production build | Client and Cloudflare worker passed; worker named `wifaura` |
| Solidity/EVM execution | `npm run contracts:test` passed |
| New WIFAURA source lint | Passed |
| Original generated integrations and Drizzle migrations | No edits |
| Test compiler/harness in built worker | No `solc` or `ganache` imports found |

- TypeScript checks and production client/worker build.
- Disposable PostgreSQL WASM executes the actual inherited migrations followed
  by WIFAURA's schema. Anonymous and collector roles cannot access private WIF
  evidence or call fulfillment. Challenges consume once; expired proofs fail.
- Repeated quote requests resolve to the same quote. Reserve snapshots survive
  later wallet edits. Repeated fulfillment produces one manifestation and one
  contribution. Another user or a different hash cannot reuse fulfillment.
- Complimentary and paid unsealings count once per user/drop. Simulated art
  does not count. WIFAURA's first awakening occurs at exactly 100; the next
  entity remains hidden. Nimiq progress remains separate.
- Receipt fixtures reject wrong contract, sender, quote, Reserve, amount,
  unequal split, removed logs, failed receipts, noncanonical blocks, reorgs,
  transactions outside the quote window and unfinalized evidence.
- UI tests cover duplicate clicks, interrupted wallet sends across reload,
  verification without resending, and no artwork issuance for approval alone.
- $1 pricing tests cover exact integer conversion and equal-split rounding,
  pinned chain/token/pool checks, low liquidity, inactive markets, stale cache
  dates, unavailable feeds and redirects. Live read-only execution of the actual
  pricing helper returned a dated WIF/USD rate and a $1-equivalent token amount.
  No market read transferred tokens or deployed a contract. Rate evidence is
  saved per quote; subsequent verification does not depend on market uptime.
- Solidity compilation and an isolated EVM exercise real contract execution:
  equal token transfers, payer-scoped replay protection, odd-amount rejection,
  deadline binding, expiry, invalid Reserve and full rollback after a mined
  second-transfer failure. No public-chain funds are used.
- Browser/server guards reject the original backend. Copied environment and
  Supabase project linkage have been removed. Git has no remote in this copy.

PostgreSQL tests submit overlapping requests to a single PGlite instance; they
exercise replay behavior and SQL locks but do not replace a multi-connection
hosted concurrency test. An independent contract audit has not been performed.

## Dependency checks

Validation updated viem to 2.57.18, Vite to 8.3.8 and Zod to 4.6.7 after the
initial advisory check found issues in their earlier versions. The npm
lockfile is authoritative; the inherited Bun lockfile was removed.

The post-update audit still reports findings inside Ganache's bundled test
toolchain, including when npm is asked to omit development dependencies.
Every remaining reported path in that audit is under `node_modules/ganache/`.
Ganache is a pinned development-only dependency used by the in-process
contract harness, with no public listener; it must not be shipped or imported
by the worker. This is not a claim that the entire development dependency
tree is advisory-free. No broad forced dependency rewrite was performed.

## Not yet verified

- New hosted backend provisioning, production migrations, auth redirect/OAuth
  configuration and multi-user concurrency against hosted PostgreSQL.
- Mobile injected-wallet compatibility on the actual chosen host.
- Mainnet deployment, explorer source verification, real token compatibility
  with the exact-balance split checks, ETH gas cost and finalized WIF checkout.
- A real Reserve transfer and end-to-end issuance from that real payment.
- Live app smoke test, recorded demo and hackathon submission.

These require the owner's deployment configuration and explicit approval for
external changes or transactions. Local test transactions must not be used as
hackathon payment evidence. The app defaults to disabled payments until
configuration and verified contract code are provided.
