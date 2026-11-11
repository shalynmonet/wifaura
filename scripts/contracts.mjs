import solc from "solc";
import { readFileSync, mkdirSync, writeFileSync } from "node:fs";

export function compile(extra = {}) {
  const sources = {
    "WifauraPayments.sol": { content: readFileSync("contracts/WifauraPayments.sol", "utf8") },
    ...extra,
  };
  const settings = {
    optimizer: { enabled: true, runs: 200 },
    evmVersion: "shanghai",
    outputSelection: {
      "*": {
        "*": [
          "abi",
          "evm.bytecode.object",
          "evm.deployedBytecode.object",
          "evm.deployedBytecode.immutableReferences",
        ],
      },
    },
  };
  const result = JSON.parse(
    solc.compile(JSON.stringify({ language: "Solidity", sources, settings })),
  );
  const errors = (result.errors ?? []).filter((e) => e.severity === "error");
  if (errors.length) throw new Error(errors.map((e) => e.formattedMessage).join("\n"));
  return result.contracts;
}
if (process.argv[1]?.endsWith("contracts.mjs")) {
  const contract = compile()["WifauraPayments.sol"].WifauraPayments;
  mkdirSync("contracts/artifacts", { recursive: true });
  writeFileSync(
    "contracts/artifacts/WifauraPayments.json",
    JSON.stringify(
      {
        compiler: solc.version(),
        optimizer: { enabled: true, runs: 200 },
        evmVersion: "shanghai",
        ...contract,
      },
      null,
      2,
    ),
  );
  console.log("Compiled WifauraPayments. No deployment or transaction sent.");
  writeFileSync(
    "src/lib/wif/deployment-artifact.json",
    JSON.stringify(
      {
        abi: contract.abi,
        bytecode: `0x${contract.evm.bytecode.object}`,
      },
      null,
      2,
    ),
  );
}
