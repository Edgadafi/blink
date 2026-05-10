import path from "path";
import { fileURLToPath } from "url";
import { SolanaAgentKit, KeypairWallet } from "solana-agent-kit";
import { startMcpServer } from "@solana-agent-kit/adapter-mcp";
import TokenPlugin from "@solana-agent-kit/plugin-token";
import * as dotenv from "dotenv";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.join(__dirname, ".env") });

const SOLANA_PRIVATE_KEY = process.env.SOLANA_PRIVATE_KEY;
const RPC_URL = process.env.RPC_URL;

if (!SOLANA_PRIVATE_KEY || !RPC_URL) {
  console.error("Error: SOLANA_PRIVATE_KEY y RPC_URL son requeridos en .env o en la config MCP");
  process.exit(1);
}

const wallet = new KeypairWallet(SOLANA_PRIVATE_KEY);
const agent = new SolanaAgentKit(wallet, RPC_URL, {
  OPENAI_API_KEY: process.env.OPENAI_API_KEY,
}).use(TokenPlugin);

// Acciones expuestas al MCP server (solo TokenPlugin para evitar conflictos de deps)
const mcp_actions = {
  BALANCE_ACTION: agent.actions.find((a) => a.name === "BALANCE_ACTION")!,
  TRANSFER_ACTION: agent.actions.find((a) => a.name === "TRANSFER_ACTION")!,
  DEPLOY_TOKEN_ACTION: agent.actions.find((a) => a.name === "DEPLOY_TOKEN_ACTION")!,
  GET_WALLET_ADDRESS_ACTION: agent.actions.find((a) => a.name === "GET_WALLET_ADDRESS_ACTION")!,
  TOKEN_BALANCE_ACTION: agent.actions.find((a) => a.name === "TOKEN_BALANCE_ACTION")!,
};

startMcpServer(mcp_actions, agent, {
  name: "solana-agent-kit",
  version: "1.0.0",
});
