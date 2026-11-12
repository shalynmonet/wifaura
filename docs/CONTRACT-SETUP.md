# Wallet-approved contract deployment

The `/deploy-payment` page is an owner setup utility, separate from checkout.
It uses the same pinned compiler output as the local contract tests. The
`prebuild` command regenerates its ABI and creation bytecode from source.

1. Set the public `VITE_WALLETCONNECT_PROJECT_ID` from a dedicated Reown
   WIFAURA project, allowlist the production origin, and rebuild. Open the page
   on a computer. Connect and estimate gas first; use Robinhood Wallet's
   scanner beside Web3 Search for the QR code and approve the connection.
   The current connection screen is a QR flow; mobile deep links are not provided.
   This requests the public account and Robinhood Chain (4663), then performs
   read-only RPC calls. No signature or transaction is sent by this step.
2. Review the immutable WIF token and treasury shown on the page, connected
   account, and estimated ETH fee. The deployer needs ETH on Robinhood Chain.
3. Only after approval, check the consent box and use Review deployment in
   wallet. The wallet must still show the same account and network. Review its
   final fee and contract creation request before approving.
4. The page records an attempt before invoking the wallet. An ambiguous
   failure or reload does not offer an automatic resend. Inspect wallet
   activity and reconcile the deployment before clearing browser state or
   trying from another device. A saved transaction hash is displayed when
   available. This browser record is a convenience, not onchain evidence.
   Use Recover previous deployment connection after a stuck request. It checks
   the expected contract address and confirmed/pending outgoing counts, closes
   the old WalletConnect session, then rechecks before unlocking a separately
   approved retry. The original nonce is retained, so a delayed original
   broadcast and a retry cannot create two contracts. Legacy attempts without
   a nonce can recover only at unused nonce zero. Existing code or an outgoing
   transaction blocks resending. Recovery never submits a transaction.
   Before sending, a 12-second session ping checks wallet reachability. The
   deployment uses one explicit eth_sendTransaction request, a pinned nonce,
   and estimated gas with a 20% gas-limit buffer; there is no fallback send.
   A ping timeout does not establish the root cause of a missing wallet prompt.
   Test wallet signing — no ETH sends one personal_sign request for a fixed,
   non-authorizing connectivity message with a random nonce and timestamp.
   It verifies the recovered EOA address locally and keeps proof only in memory
   for two minutes, bound to the same provider and address. That verified
   signing response can replace the ping check; a stale or mismatched response
   cannot. No transaction is requested by the test. A missing response times
   out after 60 seconds without unlocking a deployment automatically.
   The SDK initialization promise is shared across recovery/reconnect within
   the page; only one SignClient and disconnect listener are created. Do not
   initialize additional SDK clients against the same stored session. Close
   other WIFAURA wallet tabs while diagnosing responses, then hard-refresh
   one setup tab, recover, and pair a fresh session.
5. Give the public transaction hash and contract address to the setup process.
   A successful receipt alone does not enable payments. Run the independent
   deployment source/getter/code-hash checks, verify explorer source, configure
   server settings, and only then approve a real checkout test.

The deployment page explicitly uses WalletConnect; normal checkout can also
use an injected EIP-1193 wallet. Actual pairing, signing, and contract creation
support on the owner's phone must be checked before declaring compatibility.

WalletConnect uses the pinned Universal Provider 2.26.0 with a local QR renderer
instead of the bundled AppKit picker. Core telemetry is disabled. The five
wallet tests cover missing configuration, single-flight pairing, required
chain/RPC/origin, injected-wallet behavior, avoiding unnecessary chain-switch
requests, and refusal of restored sessions lacking Robinhood Chain. The
dependency audit reports no advisories outside the pre-existing development-only
Ganache subtree. Real wallet pairing and transactions are still required.

Server credential: store only in WIFAURA Pages Production encrypted secrets,
named `SUPABASE_SECRET_KEY`. Never enter it in this deployment page, source,
browser build variables, or chat. Keep both payment flags off during setup.
