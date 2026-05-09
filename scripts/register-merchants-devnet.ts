/**
 * Register one or more merchant pubkeys on devnet/mainnet via `register_merchant`.
 * Only the payer (ANCHOR_WALLET / ~/.config/solana/id.json) signs.
 *
 * Usage:
 *   MERCHANT_PUBKEYS='<pk1>,<pk2>' yarn register-merchants:devnet
 *   SOLANA_RPC_URL=https://api.devnet.solana.com yarn register-merchants:devnet
 *
 * If MERCHANT_PUBKEYS is omitted, generates 3 demo keypairs and writes them to
 * scripts/.merchants-demo-devnet.json (gitignored); fund those wallets before
 * using them as Blink signers / cashout wallets.
 */

import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";

import * as anchor from "@coral-xyz/anchor";
import {
  AnchorProvider,
  Program,
  Wallet,
  type Idl,
} from "@coral-xyz/anchor";
import {
  Connection,
  Keypair,
  PublicKey,
  Transaction,
  clusterApiUrl,
} from "@solana/web3.js";

import idl from "../target/idl/remesa_liquidez.json";
import type { RemesaLiquidez } from "../target/types/remesa_liquidez";
import type { RemesaProgram } from "../client/index";
import { buildRegisterMerchantIx, findMerchantPda } from "../client/index";

type Cluster = "devnet" | "testnet" | "mainnet-beta";

function parseCluster(raw: string | undefined): Cluster {
  if (
    raw === "mainnet-beta" ||
    raw === "testnet" ||
    raw === "devnet"
  ) {
    return raw;
  }
  return "devnet";
}

async function main() {
  const cluster = parseCluster(
    process.env.SOLANA_CLUSTER ?? process.env.ANCHOR_PROVIDER_URL_CLUSTER
  );
  const rpc =
    process.env.SOLANA_RPC_URL ??
    clusterApiUrl(cluster === "mainnet-beta" ? "mainnet-beta" : cluster);

  const keypairPath =
    process.env.ANCHOR_WALLET ??
    path.join(os.homedir(), ".config/solana/id.json");
  const raw = fs.readFileSync(keypairPath, "utf8");
  const payer = Keypair.fromSecretKey(Uint8Array.from(JSON.parse(raw)));
  const wallet = new Wallet(payer);

  const connection = new Connection(rpc, "confirmed");
  const provider = new AnchorProvider(connection, wallet, {
    commitment: "confirmed",
  });

  const program = new Program(
    idl as Idl,
    provider
  ) as unknown as RemesaProgram;

  const envMerchants =
    process.env.MERCHANT_PUBKEYS?.trim() ||
    process.env.MERCHANT_PUBKEY?.trim();

  let merchants: PublicKey[];

  if (envMerchants) {
    merchants = envMerchants
      .split(/[\s,]+/)
      .map((s) => s.trim())
      .filter(Boolean)
      .map((s) => new PublicKey(s));
    console.log(
      `[register-merchants] Registering ${merchants.length} pubkeys from env`
    );
  } else {
    const DEMO_PATH = path.join(__dirname, ".merchants-demo-devnet.json");
    const kpairs = [Keypair.generate(), Keypair.generate(), Keypair.generate()];
    merchants = kpairs.map((k) => k.publicKey);

    fs.writeFileSync(
      DEMO_PATH,
      JSON.stringify(
        {
          cluster,
          programId: program.programId.toBase58(),
          generatedAt: new Date().toISOString(),
          note: "Import secretKey into Phantom Devnet for demo cash-outs.",
          merchants: kpairs.map((k, i) => ({
            label: `demo-merchant-${i + 1}`,
            publicKey: k.publicKey.toBase58(),
            secretKey: Array.from(k.secretKey),
          })),
        },
        null,
        2
      ),
      "utf8"
    );
    console.log(
      `[register-merchants] No MERCHANT_PUBKEYS — generated 3 demo merchants`
    );
    console.log(`[register-merchants] Keys written to ${DEMO_PATH}`);
    kpairs.forEach((k, i) =>
      console.log(`  demo-merchant-${i + 1}: ${k.publicKey.toBase58()}`)
    );
  }

  let registered = 0;
  let skipped = 0;

  for (const merchant of merchants) {
    const [merchantPda] = findMerchantPda(program.programId, merchant);
    const info = await connection.getAccountInfo(merchantPda);
    if (info) {
      console.log(
        `[skip] already registered merchant=${merchant.toBase58()} pda=${merchantPda.toBase58()}`
      );
      skipped += 1;
      continue;
    }

    const ix = await buildRegisterMerchantIx({
      program,
      admin: wallet.publicKey,
      merchant,
    });
    const sig = await provider.sendAndConfirm(new Transaction().add(ix), []);
    console.log(
      `[ok] registered merchant=${merchant.toBase58()} pda=${merchantPda.toBase58()} tx=${sig}`
    );
    registered += 1;
  }

  console.log(
    `[register-merchants] done cluster=${cluster} registered=${registered} skipped=${skipped} admin=${wallet.publicKey.toBase58()}`
  );
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
