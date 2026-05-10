/**
 * Límites de monto para remesas (configurables por env)
 */
export const MIN_SOL = parseFloat(process.env.MIN_SOL ?? "0.001");
export const MAX_SOL = parseFloat(process.env.MAX_SOL ?? "100");
export const MIN_USDC = parseFloat(process.env.MIN_USDC ?? "1");
export const MAX_USDC = parseFloat(process.env.MAX_USDC ?? "50000");

export function validateAmountSol(amount: number): { ok: true } | { ok: false; message: string } {
  if (amount < MIN_SOL) {
    return { ok: false, message: `Monto mínimo: ${MIN_SOL} SOL` };
  }
  if (amount > MAX_SOL) {
    return { ok: false, message: `Monto máximo: ${MAX_SOL} SOL` };
  }
  return { ok: true };
}

export function validateAmountUsdc(amount: number): { ok: true } | { ok: false; message: string } {
  if (amount < MIN_USDC) {
    return { ok: false, message: `Monto mínimo: ${MIN_USDC} USDC` };
  }
  if (amount > MAX_USDC) {
    return { ok: false, message: `Monto máximo: ${MAX_USDC} USDC` };
  }
  return { ok: true };
}
