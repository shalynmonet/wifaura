// In-process disposable EVM only. No public RPC, real key, or real transaction.
import assert from "node:assert/strict";
import ganache from "ganache";
import {
  createPublicClient,
  createWalletClient,
  custom,
  defineChain,
  encodeDeployData,
} from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { compile } from "./contracts.mjs";
import {
  assertDeploymentFactory,
  factoryDeploymentPlan,
  DEPLOYMENT_FACTORY,
  FACTORY_RUNTIME,
} from "../src/lib/wif/deployment-factory.ts";

const artifacts = compile({
  "Token.sol": {
    content: "// SPDX-License-Identifier: MIT\npragma solidity ^0.8.24; contract FactoryToken {}",
  },
});
const provider = ganache.provider({
  logging: { quiet: true },
  chain: { chainId: 4663, hardfork: "shanghai" },
  wallet: { totalAccounts: 2 },
});
try {
  const chain = defineChain({
    id: 4663,
    name: "Isolated factory test",
    nativeCurrency: { name: "ETH", symbol: "ETH", decimals: 18 },
    rpcUrls: { default: { http: ["http://127.0.0.1"] } },
  });
  const client = createPublicClient({ chain, transport: custom(provider) });
  const wallet = createWalletClient({ chain, transport: custom(provider) });
  const [payer, treasury] = await wallet.getAddresses();
  const key = provider.getInitialAccounts()[payer.toLowerCase()].secretKey;
  const account = privateKeyToAccount(key);
  const tokenArtifact = artifacts["Token.sol"].FactoryToken;
  const tokenTx = await wallet.deployContract({
    account,
    abi: tokenArtifact.abi,
    bytecode: `0x${tokenArtifact.evm.bytecode.object}`,
  });
  const token = (await client.waitForTransactionReceipt({ hash: tokenTx })).contractAddress;
  await provider.request({
    method: "evm_setAccountCode",
    params: [DEPLOYMENT_FACTORY, FACTORY_RUNTIME],
  });
  assertDeploymentFactory(await client.getCode({ address: DEPLOYMENT_FACTORY }));
  assert.throws(() => assertDeploymentFactory("0x6000"), /does not match/);
  const artifact = artifacts["WifauraPayments.sol"].WifauraPayments;
  const init = encodeDeployData({
    abi: artifact.abi,
    bytecode: `0x${artifact.evm.bytecode.object}`,
    args: [token, treasury],
  });
  const plan = factoryDeploymentPlan(init);
  const hash = await wallet.sendTransaction({ account, to: plan.to, data: plan.data, value: 0n });
  const receipt = await client.waitForTransactionReceipt({ hash });
  assert.equal(receipt.status, "success");
  assert.equal(receipt.contractAddress, null); // Factory call, not a direct CREATE transaction.
  assert((await client.getCode({ address: plan.address })).length > 2);
  assert.equal(
    (
      await client.readContract({ address: plan.address, abi: artifact.abi, functionName: "token" })
    ).toLowerCase(),
    token.toLowerCase(),
  );
  assert.equal(
    (
      await client.readContract({
        address: plan.address,
        abi: artifact.abi,
        functionName: "treasury",
      })
    ).toLowerCase(),
    treasury.toLowerCase(),
  );
  let masked = (await client.getCode({ address: plan.address })).slice(2);
  for (const refs of Object.values(artifact.evm.deployedBytecode.immutableReferences))
    for (const { start, length } of refs)
      masked =
        masked.slice(0, start * 2) + "0".repeat(length * 2) + masked.slice((start + length) * 2);
  assert.equal(masked.toLowerCase(), artifact.evm.deployedBytecode.object.toLowerCase());
  await assert.rejects(() =>
    client.estimateGas({ account: payer, to: plan.to, data: plan.data, value: 0n }),
  );
  console.log(
    "Factory call creates the exact payment runtime at its predicted address, preserves immutables, rejects duplicate deployment and refuses altered factory code.",
  );
} finally {
  await provider.disconnect();
}
