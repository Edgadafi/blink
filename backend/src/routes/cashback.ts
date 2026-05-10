/**
 * Rutas de cashback
 */
import { Router } from "express";
import {
  generarCodigoReferido,
  registrarReferido,
  obtenerResumenCashback,
  canjearCashback,
} from "../services/cashback.js";
import { z } from "zod";

const router = Router();

router.post("/generar-codigo", async (req, res) => {
  try {
    const { usuario_wa } = req.body;
    if (!usuario_wa) {
      return res.status(400).json({ error: "usuario_wa requerido" });
    }
    const result = await generarCodigoReferido(usuario_wa);
    res.json(result);
  } catch (err) {
    console.error("Error generar codigo:", err);
    res.status(500).json({ error: "Error al generar codigo" });
  }
});

router.post("/registrar-referido", async (req, res) => {
  try {
    const { referido_wa, codigo } = req.body;
    if (!referido_wa || !codigo) {
      return res.status(400).json({ error: "referido_wa y codigo requeridos" });
    }
    const result = await registrarReferido(referido_wa, codigo);
    res.json(result);
  } catch (err) {
    console.error("Error registrar referido:", err);
    res.status(400).json({
      error: err instanceof Error ? err.message : "Error al registrar referido",
    });
  }
});

router.get("/:wa", async (req, res) => {
  try {
    const wa = req.params.wa;
    const resumen = await obtenerResumenCashback(wa);
    res.json(resumen);
  } catch (err) {
    console.error("Error obtener cashback:", err);
    res.status(500).json({ error: "Error al obtener cashback" });
  }
});

router.post("/canjear", async (req, res) => {
  try {
    const schema = z.object({ usuario_wa: z.string(), monto: z.number().positive() });
    const parsed = schema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: parsed.error.flatten() });
    }
    const result = await canjearCashback(parsed.data.usuario_wa, parsed.data.monto);
    res.json(result);
  } catch (err) {
    console.error("Error canjear:", err);
    res.status(400).json({
      error: err instanceof Error ? err.message : "Error al canjear",
    });
  }
});

export default router;
