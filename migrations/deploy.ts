// Deploy / bootstrap migrations. Run against devnet with:
//   anchor migrate --provider.cluster devnet

import * as anchor from "@coral-xyz/anchor";
import { Transaction } from "@solana/web3.js";
import type { RemesaProgram } from "../client/index";
import { buildInitializeConfigIx, findConfigPda } from "../client/index";

module.exports = async function (provider: anchor.AnchorProvider) {
  anchor.setProvider(provider);

  const program =
    anchor.workspace.remesaLiquidez as unknown as RemesaProgram;
  const [configPda] = findConfigPda(program.programId);

  const existing = await provider.connection.getAccountInfo(configPda);
  if (existing) {
    console.log(
      `[migrate] Config already exists — skip initialize_config (${configPda.toBase58()})`
    );
    return;
  }

  const ix = await buildInitializeConfigIx({
    program,
    admin: provider.wallet.publicKey,
  });

  const sig = await provider.sendAndConfirm(new Transaction().add(ix));
  console.log(
    `[migrate] initialize_config confirmed: ${sig} (config=${configPda.toBase58()})`
  );
};
