import { concatHex, getCreate2Address, keccak256, toHex, type Hex } from "viem";

// Arachnid deterministic-deployment-proxy, published runtime from its signed
// deployment transaction. Verify exact code before estimating or requesting a call.
export const DEPLOYMENT_FACTORY = "0x4e59b44847b379578588920cA78FbF26c0B4956C" as const;
export const FACTORY_RUNTIME =
  "0x7fffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffe03601600081602082378035828234f58015156039578182fd5b8082525050506014600cf3" as const;
export const DEPLOYMENT_SALT = keccak256(toHex("WIFAURA payments v1 Robinhood Chain 4663"));
export function assertDeploymentFactory(code: Hex | undefined) {
  if (code?.toLowerCase() !== FACTORY_RUNTIME)
    throw new Error(
      "Deployment factory code does not match the verified source. Deployment is blocked.",
    );
}
export function factoryDeploymentPlan(initCode: Hex) {
  return {
    to: DEPLOYMENT_FACTORY,
    data: concatHex([DEPLOYMENT_SALT, initCode]),
    address: getCreate2Address({
      from: DEPLOYMENT_FACTORY,
      salt: DEPLOYMENT_SALT,
      bytecode: initCode,
    }),
  };
}
