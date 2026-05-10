/**
 * Servicio de cashback y referidos
 */
import pool from "../db/pool.js";
import { randomBytes } from "crypto";

const PORCENTAJE_NIVEL1 = 1.0;
const PORCENTAJE_NIVEL2 = 0.5;

function generarCodigo(): string {
  return randomBytes(4).toString("hex").toUpperCase();
}

export async function generarCodigoReferido(usuario_wa: string) {
  let codigo = generarCodigo();
  let exists = true;
  while (exists) {
    const res = await pool.query(
      "SELECT 1 FROM cashback_referidos WHERE codigo = $1",
      [codigo]
    );
    exists = res.rows.length > 0;
    if (exists) codigo = generarCodigo();
  }

  await pool.query(
    `INSERT INTO cashback_referidos (referidor_wa, referido_wa, codigo)
     VALUES ($1, $1, $2)
     ON CONFLICT (referidor_wa, referido_wa) DO UPDATE SET codigo = EXCLUDED.codigo`,
    [usuario_wa, codigo]
  );

  return { codigo };
}

export async function registrarReferido(
  referido_wa: string,
  codigo: string
) {
  const ref = await pool.query(
    "SELECT referidor_wa FROM cashback_referidos WHERE codigo = $1 AND referidor_wa = referido_wa",
    [codigo]
  );
  if (ref.rows.length === 0) {
    throw new Error("Código de referido no válido");
  }
  const referidor_wa = ref.rows[0].referidor_wa;
  if (referidor_wa === referido_wa) {
    throw new Error("No puedes referirte a ti mismo");
  }

  await pool.query(
    `INSERT INTO cashback_referidos (referidor_wa, referido_wa, codigo)
     VALUES ($1, $2, $3)
     ON CONFLICT (referidor_wa, referido_wa) DO NOTHING`,
    [referidor_wa, referido_wa, codigo]
  );

  return { referidor_wa };
}

export async function registrarCashbackPorRemesa(
  usuario_wa: string,
  montoRemesa: number,
  suscripcion_id: string
) {
  const monto = (montoRemesa * PORCENTAJE_NIVEL1) / 100;
  await pool.query(
    `INSERT INTO cashback_transacciones (usuario_wa, monto, tipo, suscripcion_id, nivel)
     VALUES ($1, $2, 'remesa', $3, 1)`,
    [usuario_wa, monto, suscripcion_id]
  );

  // Nivel 2: referidor del remitente
  const ref = await pool.query(
    "SELECT referidor_wa FROM cashback_referidos WHERE referido_wa = $1",
    [usuario_wa]
  );
  if (ref.rows.length > 0) {
    const monto2 = (montoRemesa * PORCENTAJE_NIVEL2) / 100;
    await pool.query(
      `INSERT INTO cashback_transacciones (usuario_wa, monto, tipo, suscripcion_id, referido_wa, nivel)
       VALUES ($1, $2, 'referido', $3, $4, 2)`,
      [ref.rows[0].referidor_wa, monto2, suscripcion_id, usuario_wa]
    );
  }
}

export async function obtenerResumenCashback(usuario_wa: string) {
  const total = await pool.query(
    `SELECT COALESCE(SUM(monto), 0) as total FROM cashback_transacciones WHERE usuario_wa = $1`,
    [usuario_wa]
  );

  const transacciones = await pool.query(
    `SELECT * FROM cashback_transacciones WHERE usuario_wa = $1
     ORDER BY created_at DESC LIMIT 10`,
    [usuario_wa]
  );

  const codigoRes = await pool.query(
    "SELECT codigo FROM cashback_referidos WHERE referidor_wa = $1 AND referido_wa = $1 LIMIT 1",
    [usuario_wa, usuario_wa]
  );

  return {
    total_acumulado: parseFloat(total.rows[0]?.total || "0"),
    reclamado: 0,
    disponible: parseFloat(total.rows[0]?.total || "0"),
    ultimas_transacciones: transacciones.rows,
    codigo_referido: codigoRes.rows[0]?.codigo || null,
  };
}

export async function canjearCashback(usuario_wa: string, monto: number) {
  const res = await pool.query(
    `SELECT COALESCE(SUM(monto), 0) as total FROM cashback_transacciones WHERE usuario_wa = $1`,
    [usuario_wa]
  );
  const disponible = parseFloat(res.rows[0]?.total || "0");
  if (monto > disponible) {
    throw new Error("Saldo insuficiente");
  }
  // Simulado: en producción se haría transferencia real
  return {
    exito: true,
    monto_canjeado: monto,
    mensaje: "Canje simulado. En producción se transferiría a tu wallet.",
  };
}
