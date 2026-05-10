/**
 * ElevenLabs TTS — Remesa LiquidezIA
 *
 * Puerto de nayelicz/remesa-blink/backend/src/services/elevenLabsService.ts
 * adaptado para Vercel Serverless (sin disco, devuelve Buffer directamente).
 *
 * Voz por defecto: Sarah (EXAVITQu4vr4xnSDxMaL) — femenina, cálida, español MX
 * Modelo: eleven_multilingual_v2 — soporta español mexicano nativo
 *
 * Voces sugeridas (sobreescribir con ELEVENLABS_VOICE_ID):
 *   EXAVITQu4vr4xnSDxMaL → Sarah  (femenina, cálida)    ← LidIA default
 *   onwK4e9ZLuTAKqWW03F9 → Daniel (masculino, neutral)
 *   pNInz6obpgDQGcFmaJgB → Adam   (masculino, formal)
 *   MF3mGyEYCl7XYWbV9V6O → Elli   (femenina, joven)
 */

const ELEVENLABS_API_KEY =
  process.env.ELEVENLABS_API_KEY ?? "";

const ELEVENLABS_VOICE_ID =
  process.env.ELEVENLABS_VOICE_ID ?? "EXAVITQu4vr4xnSDxMaL";

const ELEVENLABS_MODEL = "eleven_multilingual_v2";

const TTS_ENDPOINT = (voiceId: string) =>
  `https://api.elevenlabs.io/v1/text-to-speech/${voiceId}`;

/** Configuración de voz — misma que el original para consistencia */
const VOICE_SETTINGS = {
  stability: 0.55,          // voz natural, no robótica
  similarity_boost: 0.80,   // consistente con el perfil de voz
  style: 0.20,              // ligera expresividad
  use_speaker_boost: true,
};

// ── Core TTS ──────────────────────────────────────────────────────────────────

/**
 * Convierte texto a audio MP3 y devuelve el Buffer.
 * No usa disco — compatible con Vercel Serverless y Edge.
 */
export async function textToSpeech(text: string): Promise<Buffer> {
  if (!ELEVENLABS_API_KEY) {
    throw new Error("ELEVENLABS_API_KEY no configurada en las variables de entorno.");
  }

  const response = await fetch(TTS_ENDPOINT(ELEVENLABS_VOICE_ID), {
    method: "POST",
    headers: {
      "xi-api-key": ELEVENLABS_API_KEY,
      "Content-Type": "application/json",
      Accept: "audio/mpeg",
    },
    body: JSON.stringify({
      text,
      model_id: ELEVENLABS_MODEL,
      voice_settings: VOICE_SETTINGS,
    }),
  });

  if (!response.ok) {
    const err = await response.text();
    throw new Error(`ElevenLabs error ${response.status}: ${err}`);
  }

  const arrayBuffer = await response.arrayBuffer();
  return Buffer.from(arrayBuffer);
}

/**
 * Devuelve el audio MP3 en base64.
 * Útil para embeber en JSON o enviar a servicios externos (Render/WhatsApp).
 */
export async function textToSpeechBase64(text: string): Promise<string> {
  const buffer = await textToSpeech(text);
  return buffer.toString("base64");
}

// ── Scripts de confirmación ───────────────────────────────────────────────────

/**
 * Script de confirmación post mark_verified.
 * LidIA anuncia al receptor que su dinero está listo.
 */
export function buildConfirmationScript(
  amountUSDC: number,
  storeName?: string
): string {
  const amount = amountUSDC.toFixed(2);
  const amountMXN = (amountUSDC * 17.2).toFixed(0);

  if (storeName) {
    return (
      `¡Hola! Soy LidIA, tu asistente de remesas. ` +
      `Tu remesa de ${amount} dólares, equivalente a ${amountMXN} pesos mexicanos, ` +
      `ya está verificada y lista para retirar. ` +
      `Dirígete a ${storeName} y muestra este código al cajero. ` +
      `¡Tu dinero te espera!`
    );
  }

  return (
    `¡Hola! Soy LidIA, tu asistente de remesas. ` +
    `Tu remesa de ${amount} dólares, equivalente a ${amountMXN} pesos mexicanos, ` +
    `ya está verificada y lista para retirar en cualquier comercio aliado. ` +
    `¡Tu dinero te espera!`
  );
}

/**
 * Script de notificación de nueva remesa pendiente.
 * Se usa antes de que el sender haya marcado como verificado.
 */
export function buildPendingScript(amountUSDC: number): string {
  const amount = amountUSDC.toFixed(2);
  const amountMXN = (amountUSDC * 17.2).toFixed(0);

  return (
    `¡Hola! Soy LidIA. ` +
    `Has recibido una remesa de ${amount} dólares, ` +
    `equivalente a ${amountMXN} pesos mexicanos. ` +
    `Espera la confirmación del remitente para poder retirar el efectivo. ` +
    `Te avisaré cuando esté listo.`
  );
}

// ── Health check (verificar que la API key es válida) ─────────────────────────

export function isConfigured(): boolean {
  return ELEVENLABS_API_KEY.length > 0;
}
