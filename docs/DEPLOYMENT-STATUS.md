# Deployment status

Updated November 11, 2026.

WIFAURA is live at https://wifaura.sha-i.com on Cloudflare Pages. Public source:
https://github.com/shalynmonet/wifaura. Google sign-in works, confirmed by the
owner. Its separate SHA-I backend is bvnjosopyjblugshdbwd. The protected server
key is configured as an encrypted Pages Production secret; its value has not
been retrieved or placed in source. Wallet linking is open. Both paid-checkout
flags remain false. Latest wallet-setup deployment: bed88e93.

Squarespace retains its original nameservers; only the wifaura CNAME points
to Pages. NIMAURA's repository and backend remain unchanged. The earlier
https://wifaura.wifaura.workers.dev deployment remains a fallback.

## Verified payment contract

- Robinhood Chain mainnet: 4663, ETH gas.
- Contract: 0x2d889Ff462B21177A4C2E6384D258eC867222D69
- WIF token: 0x5173b8eA6923c2d40267890D45C46a3480954773, 18 decimals.
- Treasury: 0x1fbe8ca7ab3bb424520972b6e27c0130f4971985
- Runtime hash: 0x4bdfd605b0c3ba7414344ccdb5290cde5e0862eb570ace6e43edd5f7821419b4
- Deployment: 0xd1da54769d0b7deb6bd60923a28997c2e791f292c9d7e1f1ae1379ce61725a9d
- Included block: 112209872.
- Actual gas paid: 0.000012372286936 ETH.
- Blockscout source verification: owner approved; returned Pass - Verified.

Independent checks match the compiled runtime after immutable masking and
verify the chain, token, treasury and decimals. Public evidence is recorded in
deployments/robinhood-mainnet.json. The canonical deployment receipt is now
covered by finalized checkpoint 112218125, and its current immutable runtime
still matches the pinned hash. The public RPC lacks historical finalized
state; receipt/block finality verification does not depend on that state query.

Real Robinhood Wallet signing and the factory deployment succeeded. Recovery
uses one SDK client and a pinned sender nonce. The factory's exact runtime is
checked before any call. See CONTRACT-SETUP.md for deployment and recovery.

## Remaining acceptance work

The owner needs a payer and separate Reserve EOA, both different from treasury.
Two standard Ethereum accounts in a new MetaMask wallet are the planned test
setup. The owner creates and backs them up; the app verifies ownership through
signatures. No private key or recovery phrase is requested by the agent.

Verify the wallet links and backend access, review funding
and WIF acquisition, then approve one real $1-equivalent WIF checkout. Check
finalized payment evidence, both equal transfers, exactly one artifact,
Reserve delivery and independent Collective progress. Repeating verification
must not change totals or resend payment. No real WIF checkout has passed yet.

## Validation and submission

Fifteen targeted wallet/recovery tests, the disposable-EVM factory test,
read-only mainnet simulation, type checks, production builds and HTTPS checks
passed. These do not replace the real checkout acceptance test.

Official rules: https://worldisflat.fun/build/rules
Entry is free; ETH funding was for deployment gas. Submissions close November
12, 2026 at 17:30 UTC (11:30 a.m. Chicago); the final closes November 16 at the
same time. A demo video and actual WIF payment evidence remain outstanding.
No hackathon submission has been made.
