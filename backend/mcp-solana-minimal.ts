#!/usr/bin/env npx tsx
/**
 * MCP Solana minimal - sin solana-agent-kit (evita conflicto pump-sdk).
 * Usa @solana/web3.js directamente.
 */
import path from "path";
import { fileURLToPath } from "url";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import {
  Connection,
  Keypair,
  PublicKey,
  SystemProgram,
  LAMPORTS_PER_SOL,
  Transaction,
  sendAndConfirmTransaction,
} from "@solana/web3.js";
import * as dotenv from "dotenv";
import bs58 from "bs58";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.join(__dirname, ".env") });

const RPC_URL = process.env.RPC_URL || "https://api.devnet.solana.com";
const SOLANA_PRIVATE_KEY = process.env.SOLANA_PRIVATE_KEY;

if (!SOLANA_PRIVATE_KEY) {
  console.error("Error: SOLANA_PRIVATE_KEY requerido en .env");
  process.exit(1);
}

const connection = new Connection(RPC_URL);
let keypair: Keypair;
try {
  keypair = Keypair.fromSecretKey(bs58.decode(SOLANA_PRIVATE_KEY));
} catch {
  console.error("Error: SOLANA_PRIVATE_KEY inválido (debe ser base58)");
  process.exit(1);
}

const server = new McpServer({ name: "solana-minimal", version: "1.0.0" });

server.tool(
  "get_balance",
  { address: z.string().optional().describe("Dirección de la wallet (opcional)") },
  async ({ address }) => {
    const addr = address || keypair.publicKey.toBase58();
    const balance = await connection.getBalance(new PublicKey(addr));
    return {
      content: [
        {
          type: "text" as const,
          text: `Balance: ${(balance / LAMPORTS_PER_SOL).toFixed(6)} SOL (${balance} lamports)`,
        },
      ],
    };
  }
);

server.tool("get_wallet_address", {}, async () => ({
  content: [{ type: "text" as const, text: keypair.publicKey.toBase58() }],
}));

server.tool(
  "transfer_sol",
  {
    to: z.string().describe("Dirección destino"),
    amount: z.number().describe("Cantidad en SOL"),
  },
  async ({ to, amount }) => {
    const tx = new Transaction().add(
      SystemProgram.transfer({
        fromPubkey: keypair.publicKey,
        toPubkey: new PublicKey(to),
        lamports: Math.round(amount * LAMPORTS_PER_SOL),
      })
    );
    const sig = await sendAndConfirmTransaction(connection, tx, [keypair]);
    return {
      content: [{ type: "text" as const, text: `Transferido ${amount} SOL. Tx: ${sig}` }],
    };
  }
);

async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
}

main().catch(console.error);
