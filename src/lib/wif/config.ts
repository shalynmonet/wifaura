import { defineChain, parseAbi } from "viem";

export const WIF_TOKEN = "0x5173b8eA6923c2d40267890D45C46a3480954773" as const;
export const robinhood = defineChain({
  id: 4663,
  name: "Robinhood Chain",
  nativeCurrency: { name: "Ether", symbol: "ETH", decimals: 18 },
  rpcUrls: { default: { http: ["https://rpc.mainnet.chain.robinhood.com"] } },
  blockExplorers: { default: { name: "Blockscout", url: "https://robinhoodchain.blockscout.com" } },
});
export const paymentAbi = parseAbi([
  "function pay(bytes32 quoteId, address reserve, uint256 amount, uint64 deadline)",
  "function token() view returns (address)",
  "function treasury() view returns (address)",
  "function paid(address,bytes32) view returns (bool)",
  "event Paid(bytes32 indexed quoteId, address indexed payer, address indexed reserve, uint256 amount, uint256 reserveAmount)",
]);
export type WifQuote = {
  id: string;
  intention: string;
  drop_id: string;
  quote_key: `0x${string}`;
  sender: `0x${string}`;
  reserve: `0x${string}`;
  router: `0x${string}`;
  treasury: `0x${string}`;
  amount: string;
  decimals: number;
  wif_usd_rate?: string;
  rate_source?: string;
  rate_observed_at?: string;
  expires_at: string;
  status: "quoted" | "pending" | "fulfilled" | "expired";
  tx_hash: `0x${string}` | null;
  manifestation_id: string | null;
};
