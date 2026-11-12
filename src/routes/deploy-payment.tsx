import { createFileRoute } from "@tanstack/react-router";
import { useRef, useState } from "react";
import {
  createPublicClient,
  createWalletClient,
  custom,
  encodeDeployData,
  formatEther,
  getContractAddress,
  isAddress,
  numberToHex,
  http,
  type Abi,
} from "viem";
import { AppShell } from "@/components/AppShell";
import { robinhood, WIF_TOKEN } from "@/lib/wif/config";
import {
  connectWifWallet,
  disconnectWifSession,
  getWifProvider,
  pingWifWallet,
  testWifSigning,
} from "@/lib/wif/wallet";
import { requireUnusedDeploymentNonce } from "@/lib/wif/deployment-recovery";
import artifact from "@/lib/wif/deployment-artifact.json";

const treasury = "0x1fbe8ca7ab3bb424520972b6e27c0130f4971985" as const;
const abi = artifact.abi as Abi;
const bytecode = artifact.bytecode as `0x${string}`;
const args = [WIF_TOKEN, treasury] as const;
const publicClient = createPublicClient({
  chain: robinhood,
  transport: http(undefined, { retryCount: 0 }),
});
export const Route = createFileRoute("/deploy-payment")({
  head: () => ({
    meta: [{ title: "Payment deployment — WIFAURA" }, { name: "robots", content: "noindex" }],
  }),
  component: Deployment,
});

function Deployment() {
  const [address, setAddress] = useState<`0x${string}`>();
  const [estimate, setEstimate] = useState<string>();
  const [hash, setHash] = useState<`0x${string}`>();
  const [contract, setContract] = useState<string>();
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [approved, setApproved] = useState(false);
  const [status, setStatus] = useState("");
  const inFlight = useRef(false);
  const sent = useRef(false);
  async function testSigning() {
    if (inFlight.current || !address) return;
    inFlight.current = true;
    setBusy(true);
    setError("");
    setStatus(
      "Open Robinhood Wallet and review the WIFAURA connectivity-test message. This test costs no ETH…",
    );
    try {
      await testWifSigning(address);
      setStatus(
        "Signing test passed and the signature matches your wallet. The connection can deliver signing requests. No transaction was sent. This check is valid for two minutes.",
      );
    } catch (e) {
      setStatus("");
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
      inFlight.current = false;
    }
  }
  async function recover() {
    if (inFlight.current) return;
    inFlight.current = true;
    setBusy(true);
    setError("");
    setApproved(false);
    try {
      const stored = localStorage.getItem("wifaura-deployment-attempt");
      if (!stored) {
        if (sent.current)
          throw new Error(
            "Deployment attempt data is unavailable. Check wallet activity before continuing.",
          );
        await disconnectWifSession();
        setAddress(undefined);
        setEstimate(undefined);
        setStatus(
          "Wallet connection closed without sending a transaction. Connect again to create a fresh connection.",
        );
        return;
      }
      const attempt = JSON.parse(stored) as { account: string; nonce?: number };
      if (!isAddress(attempt.account)) throw new Error("Stored wallet address is invalid.");
      const nonce = attempt.nonce ?? 0;
      const candidate = getContractAddress({ from: attempt.account, nonce: BigInt(nonce) });
      if ((await publicClient.getChainId()) !== robinhood.id)
        throw new Error("RPC network mismatch.");
      const code = await publicClient.getCode({ address: candidate });
      if (code && code !== "0x") {
        setContract(candidate);
        setStatus(
          "A contract already exists at the expected address. Share it in the setup chat for verification; do not redeploy.",
        );
        return;
      }
      const before = await Promise.all([
        publicClient.getTransactionCount({ address: attempt.account, blockTag: "latest" }),
        publicClient.getTransactionCount({ address: attempt.account, blockTag: "pending" }),
      ]);
      requireUnusedDeploymentNonce(before[0], before[1], nonce);
      setStatus("Closing the old wallet connection. No transaction is being sent…");
      await disconnectWifSession();
      const after = await Promise.all([
        publicClient.getTransactionCount({ address: attempt.account, blockTag: "latest" }),
        publicClient.getTransactionCount({ address: attempt.account, blockTag: "pending" }),
      ]);
      requireUnusedDeploymentNonce(after[0], after[1], nonce);
      localStorage.setItem(
        "wifaura-deployment-recovery",
        JSON.stringify({ account: attempt.account, nonce }),
      );
      localStorage.removeItem("wifaura-deployment-attempt");
      localStorage.removeItem("wifaura-deployment-hash");
      sent.current = false;
      setAddress(undefined);
      setEstimate(undefined);
      setStatus(
        "No outgoing transaction was found. The old connection is closed. Connect again, then review deployment separately. A retry will reuse the original transaction nonce to prevent duplicate deployment.",
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
      inFlight.current = false;
    }
  }
  async function prepare() {
    if (inFlight.current) return;
    inFlight.current = true;
    setBusy(true);
    setError("");
    setApproved(false);
    setEstimate(undefined);
    try {
      if (localStorage.getItem("wifaura-deployment-attempt")) {
        sent.current = true;
        const previous = localStorage.getItem("wifaura-deployment-hash");
        if (previous && /^0x[0-9a-fA-F]{64}$/.test(previous)) setHash(previous as `0x${string}`);
        throw new Error(
          "A previous deployment was requested in this browser. Check wallet activity and share its transaction hash in the setup chat before another attempt.",
        );
      }
      const account = await connectWifWallet(true);
      setAddress(account);
      if ((await publicClient.getChainId()) !== robinhood.id)
        throw new Error("RPC network mismatch.");
      const gas = await publicClient.estimateGas({
        account,
        data: encodeDeployData({ abi, bytecode, args }),
      });
      const price = await publicClient.getGasPrice();
      setEstimate(formatEther(gas * price));
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
      inFlight.current = false;
    }
  }
  async function deploy() {
    if (inFlight.current || sent.current || !address || !approved || !estimate) return;
    inFlight.current = true;
    setBusy(true);
    setError("");
    try {
      const provider = await getWifProvider();
      const wallet = createWalletClient({ chain: robinhood, transport: custom(provider) });
      const [account] = await wallet.getAddresses();
      if (
        account?.toLowerCase() !== address.toLowerCase() ||
        (await wallet.getChainId()) !== robinhood.id
      )
        throw new Error("Account or network changed. Connect and estimate again.");
      const recovery = JSON.parse(
        localStorage.getItem("wifaura-deployment-recovery") || "null",
      ) as { account: string; nonce: number } | null;
      if (recovery && recovery.account.toLowerCase() !== account.toLowerCase())
        throw new Error("Reconnect the original deployment wallet.");
      const latest = await publicClient.getTransactionCount({
        address: account,
        blockTag: "latest",
      });
      const pending = await publicClient.getTransactionCount({
        address: account,
        blockTag: "pending",
      });
      const nonce = requireUnusedDeploymentNonce(latest, pending, recovery?.nonce ?? latest);
      const data = encodeDeployData({ abi, bytecode, args });
      const gas = await publicClient.estimateGas({ account, data });
      const gasPrice = await publicClient.getGasPrice();
      setStatus("Checking the wallet connection. Keep Robinhood Wallet open on your iPhone…");
      await pingWifWallet(account);
      // Mark before the wallet call: an ambiguous failure must never permit an automatic resend.
      sent.current = true;
      localStorage.setItem(
        "wifaura-deployment-attempt",
        JSON.stringify({ account, nonce, at: new Date().toISOString() }),
      );
      setStatus("Sending the deployment request. Keep Robinhood Wallet open on your iPhone…");
      // Exactly one wallet request: no fallback RPC method or automatic resend.
      const result = await provider.request({
        method: "eth_sendTransaction",
        params: [
          {
            from: account,
            data,
            chainId: numberToHex(robinhood.id),
            nonce: numberToHex(nonce),
            gas: numberToHex(gas + gas / 5n),
            gasPrice: numberToHex(gasPrice),
            value: "0x0",
          },
        ],
      });
      if (typeof result !== "string" || !/^0x[0-9a-fA-F]{64}$/.test(result))
        throw new Error("Wallet did not return a transaction hash.");
      const tx = result as `0x${string}`;
      setHash(tx);
      setStatus("Transaction submitted. Waiting for the deployment receipt…");
      localStorage.setItem("wifaura-deployment-hash", tx);
      const receipt = await publicClient.waitForTransactionReceipt({ hash: tx, timeout: 120000 });
      if (receipt.status !== "success" || !receipt.contractAddress)
        throw new Error("Deployment did not succeed. Check the transaction before retrying.");
      setContract(receipt.contractAddress);
      setStatus(
        "Deployment receipt succeeded. Independent contract verification is still required.",
      );
    } catch (e) {
      setError(
        (e instanceof Error ? e.message : String(e)) +
          (sent.current
            ? " Check wallet activity before any new deployment. This page will not resend."
            : ""),
      );
    } finally {
      setBusy(false);
      inFlight.current = false;
    }
  }
  const button = "rounded-sm border border-gold px-4 py-3 text-gold disabled:opacity-40";
  return (
    <AppShell>
      <section className="mt-8 space-y-5 break-words text-sm leading-6">
        <h1 className="font-display text-3xl">Deploy WIFAURA payments</h1>
        <p>
          Owner setup on Robinhood Chain (4663). Connecting only shares your public address.
          Deployment creates a permanent contract and spends ETH for network fees; it does not
          transfer WIF or open checkout.
        </p>
        <p>
          Token: <span className="break-all">{WIF_TOKEN}</span>
        </p>
        <p>
          WIFAURA treasury: <span className="break-all">{treasury}</span>
        </p>
        <p>
          The contract sends 50% of each checkout to the collector’s separate Reserve and 50% to
          this treasury. Token and treasury cannot be changed after deployment.
        </p>
        <a
          className="text-gold underline"
          href="https://github.com/shalynmonet/wifaura/blob/main/contracts/WifauraPayments.sol"
          target="_blank"
          rel="noreferrer"
        >
          Review contract source
        </a>
        <div>
          <button className={button} disabled={busy || sent.current} onClick={prepare}>
            Connect Robinhood Wallet and estimate gas
          </button>
        </div>
        {address && (
          <p>
            Connected: <span className="break-all">{address}</span>
          </p>
        )}
        {address && (
          <div>
            <button className={button} disabled={busy || sent.current} onClick={testSigning}>
              Test wallet signing — no ETH
            </button>
            <p className="mt-3">
              This asks you to sign a connectivity-test message, then checks the signature locally.
              It does not authorize a payment or deployment.
            </p>
          </div>
        )}
        {estimate && (
          <>
            <p>
              Estimated network fee: {estimate} ETH. Your wallet shows the final fee before
              approval.
            </p>
            <label className="flex items-start gap-3">
              <input
                type="checkbox"
                checked={approved}
                onChange={(e) => setApproved(e.target.checked)}
              />
              I approve deploying this immutable contract with the token and treasury above, subject
              to reviewing the ETH fee in my wallet.
            </label>
            <button
              className={button}
              disabled={!approved || busy || sent.current}
              onClick={deploy}
            >
              Review deployment in wallet
            </button>
          </>
        )}
        {status && <p role="status">{status}</p>}
        {busy && !status && <p role="status">Waiting for wallet or network…</p>}
        <button className={button} disabled={busy} onClick={recover}>
          Recover previous deployment connection
        </button>
        <p>
          Recovery checks the chain and closes the old wallet connection. It never sends a
          deployment or payment. Use it only after a previous attempt became stuck.
        </p>
        {error && (
          <p role="alert" className="text-red-400">
            {error}
          </p>
        )}
        {hash && (
          <p>
            <a
              className="text-gold underline break-all"
              href={`${robinhood.blockExplorers.default.url}/tx/${hash}`}
              target="_blank"
              rel="noreferrer"
            >
              Deployment transaction: {hash}
            </a>
          </p>
        )}
        {contract && (
          <p>
            Created contract: <span className="break-all">{contract}</span>. Send this public
            address and transaction hash to the setup chat. Payments remain disabled until
            independent source verification.
          </p>
        )}
        <p>
          If the wallet closes or the result is unclear, check its activity before starting another
          deployment.
        </p>
      </section>
    </AppShell>
  );
}
