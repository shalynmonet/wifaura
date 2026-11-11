import assert from "node:assert/strict";
import ganache from "ganache";
import {
  createPublicClient,
  createWalletClient,
  custom,
  defineChain,
  encodeFunctionData,
  keccak256,
} from "viem";
import { compile } from "./contracts.mjs";
import { privateKeyToAccount } from "viem/accounts";

const mock = `// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;
contract MockWif {
 mapping(address=>uint256) public balanceOf;
 mapping(address=>mapping(address=>uint256)) public allowance;
 function mint(address who,uint256 amount) external {balanceOf[who]+=amount;}
 function approve(address who,uint256 amount) external returns(bool) {allowance[msg.sender][who]=amount;return true;}
 function transferFrom(address from,address to,uint256 amount) external returns(bool) {
 require(allowance[from][msg.sender]>=amount && balanceOf[from]>=amount,"funds");
 allowance[from][msg.sender]-=amount;balanceOf[from]-=amount;balanceOf[to]+=amount;return true;
 }
}`;
const contracts = compile({ "Mock.sol": { content: mock } });
const provider = ganache.provider({
  logging: { quiet: true },
  chain: { chainId: 4663, hardfork: "shanghai" },
  wallet: { totalAccounts: 5 },
});
try {
  const chain = defineChain({
    id: 4663,
    name: "Isolated Robinhood simulation",
    nativeCurrency: { name: "ETH", symbol: "ETH", decimals: 18 },
    rpcUrls: { default: { http: ["http://127.0.0.1"] } },
  });
  const transport = custom(provider),
    publicClient = createPublicClient({ transport, chain }),
    wallet = createWalletClient({ transport, chain });
  const [payer, reserve, treasury, other] = await wallet.getAddresses();
  const local = Object.fromEntries(
    Object.entries(provider.getInitialAccounts()).map(([address, value]) => [
      address.toLowerCase(),
      privateKeyToAccount(value.secretKey),
    ]),
  );
  const mockArtifact = contracts["Mock.sol"].MockWif,
    artifact = contracts["WifauraPayments.sol"].WifauraPayments;
  async function deploy(a, args = []) {
    const hash = await wallet.deployContract({
      account: local[payer.toLowerCase()],
      abi: a.abi,
      bytecode: `0x${a.evm.bytecode.object}`,
      args,
    });
    return (await publicClient.waitForTransactionReceipt({ hash })).contractAddress;
  }
  const token = await deploy(mockArtifact),
    router = await deploy(artifact, [token, treasury]);
  const read = (address, a, name, args = []) =>
    publicClient.readContract({ address, abi: a.abi, functionName: name, args });
  async function send(address, a, name, args = [], account = payer) {
    const hash = await wallet.writeContract({
      address,
      abi: a.abi,
      functionName: name,
      args,
      account: local[account.toLowerCase()],
    });
    const r = await publicClient.waitForTransactionReceipt({ hash });
    assert.equal(r.status, "success");
    return r;
  }
  const deadline = BigInt((await publicClient.getBlock()).timestamp) + 600n;
  const key = (n, expires = deadline) =>
    `0x${expires.toString(16).padStart(16, "0")}${BigInt(n).toString(16).padStart(48, "0")}`;
  await send(token, mockArtifact, "mint", [payer, 10000n]);
  await send(token, mockArtifact, "approve", [router, 1000n]);
  await send(router, artifact, "pay", [key(1), reserve, 1000n, deadline]);
  assert.equal(await read(token, mockArtifact, "balanceOf", [reserve]), 500n);
  assert.equal(await read(token, mockArtifact, "balanceOf", [treasury]), 500n);
  assert.equal(await read(router, artifact, "paid", [payer, key(1)]), true);
  async function reverts(args, account = payer) {
    await assert.rejects(
      publicClient.simulateContract({
        address: router,
        abi: artifact.abi,
        functionName: "pay",
        args,
        account,
      }),
    );
  }
  await reverts([key(1), reserve, 1000n, deadline]);
  await reverts([key(2), reserve, 999n, deadline]);
  await reverts([key(2), reserve, 1000n, deadline + 1n]);
  const expired = (await publicClient.getBlock()).timestamp - 1n;
  await reverts([key(3, expired), reserve, 1000n, expired]);
  await reverts([key(2), payer, 1000n, deadline]);
  // Force an actual mined revert after the first half-transfer. Every balance and
  // the replay flag must roll back, including the Reserve transfer.
  await send(token, mockArtifact, "approve", [router, 500n]);
  const failed = await wallet.sendTransaction({
    account: local[payer.toLowerCase()],
    to: router,
    data: encodeFunctionData({
      abi: artifact.abi,
      functionName: "pay",
      args: [key(2), reserve, 1000n, deadline],
    }),
    gas: 300000n,
  });
  assert.equal((await publicClient.waitForTransactionReceipt({ hash: failed })).status, "reverted");
  assert.equal(await read(token, mockArtifact, "balanceOf", [reserve]), 500n);
  assert.equal(await read(token, mockArtifact, "balanceOf", [treasury]), 500n);
  assert.equal(await read(router, artifact, "paid", [payer, key(2)]), false);
  // A different payer cannot consume the original payer's quote namespace.
  await send(token, mockArtifact, "mint", [other, 1000n]);
  await send(token, mockArtifact, "approve", [router, 1000n], other);
  await send(router, artifact, "pay", [key(2), reserve, 1000n, deadline], other);
  assert.equal(await read(router, artifact, "paid", [payer, key(2)]), false);
  await send(token, mockArtifact, "approve", [router, 1000n]);
  await send(router, artifact, "pay", [key(2), reserve, 1000n, deadline]);
  assert.equal(await read(token, mockArtifact, "balanceOf", [reserve]), 1500n);
  assert.equal(await read(token, mockArtifact, "balanceOf", [treasury]), 1500n);
  console.log(
    "PASS: 50/50 delivery, exact Reserve balances, replay, odd amount, deadline binding, expiry, Reserve validation, mined rollback, payer-scoped front-running protection.",
  );
  console.log(
    "Local test runtime code hash:",
    keccak256(await publicClient.getCode({ address: router })),
  );
} catch (error) {
  console.error(
    error.shortMessage || error.message,
    error.details || "",
    error.cause?.message || "",
  );
  process.exitCode = 1;
} finally {
  await provider.disconnect();
}
