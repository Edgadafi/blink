#!/usr/bin/env node
/**
 * Ejecuta db/schema.sql usando Node.js + pg (no requiere psql)
 * Uso: npm run db:schema (desde backend/)
 */
import pg from "pg";
import { readFileSync } from "fs";
import { fileURLToPath } from "url";
import { dirname, join } from "path";
import dotenv from "dotenv";

const __dirname = dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: join(__dirname, ".env"), override: true });

let DATABASE_URL = process.env.DATABASE_URL;
if (!DATABASE_URL) {
  console.error("Error: DATABASE_URL no definida en backend/.env");
  process.exit(1);
}

// Supabase/Neon: si tu red no soporta IPv6 (WSL), el host puede resolver solo a IPv6
// y causar ENETUNREACH. Solución: usa el pooler de Supabase (puerto 6543) o una DB con IPv4.

const sql = readFileSync(join(__dirname, "../db/schema.sql"), "utf-8");
const pool = new pg.Pool({
  connectionString: DATABASE_URL,
  ssl: DATABASE_URL.includes("supabase") || DATABASE_URL.includes("neon")
    ? { rejectUnauthorized: false }
    : undefined,
});

try {
  await pool.query(sql);
  console.log("Schema aplicado correctamente.");
} catch (err) {
  console.error("Error:", err.message);
  process.exit(1);
} finally {
  await pool.end();
}
