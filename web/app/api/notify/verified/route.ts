/**
 * POST /api/notify/verified
 *
 * Se llama desde el frontend/wallet tras confirmar la tx mark_verified.
 * Flujo:
 *   1. Lee TurnReservation on-chain → verifica is_verified === true
 *   2. Genera audio "dinero listo" con ElevenLabs TTS
 *   3. Si RENDER_BACKEND_URL está configurado → notifica a Render/LidIA
 *      para que envíe el audio por WhatsApp al receptor
 *   4. Si no → devuelve audioBase64 directamente (útil para demo/tests)
 *
 * Body esperado:
 * {
 *   reservationPda: string   PDA de la TurnReservation
 *   txSignature:    string   firma de la tx mark_verified (referencia)
 *   receiverWA:     string   número WhatsApp del receptor, ej: "521234567890"
 *   amountUSDC?:    number   si se omite, se lee de la reserva on-chain
 *   storeName?:     string   nombre del comercio sugerido (opcional)
 * }
 */
import { ACTIONS_CORS_HEADERS } from "@solana/actions";
import { PublicKey } from "@solana/web3.js";
import { getConnection, getProgram } from "@/lib/anchor";
import {
  buildConfirmationScript,
  isConfigured,
  textToSpeechBase64,
} from "@/lib/elevenlabs";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const RENDER_BACKEND_URL =
  process.env.RENDER_BACKEND_URL ?? "";

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "Content-Type": "application/json",
      "Access-Control-Allow-Origin": "*",
      ...ACTIONS_CORS_HEADERS,
    },
  });
}

export async function OPTIONS() {
  return new Response(null, {
    status: 204,
    headers: { "Access-Control-Allow-Origin": "*", ...ACTIONS_CORS_HEADERS },
  });
}

export async function POST(req: Request) {
  try {
    let body: {
      reservationPda?: string;
      txSignature?: string;
      receiverWA?: string;
      amountUSDC?: number;
      storeName?: string;
    };

    try {
      body = await req.json();
    } catch {
      return json({ ok: false, message: "JSON body inválido." }, 400);
    }

    const { reservationPda: pdaRaw, receiverWA, txSignature, storeName } = body;

    if (!pdaRaw || !receiverWA) {
      return json(
        {
          ok: false,
          message: "Campos requeridos: reservationPda, receiverWA.",
          example: {
            reservationPda: "<base58>",
            txSignature: "<base58>",
            receiverWA: "521234567890",
          },
        },
        400
      );
    }

    let reservationPda: PublicKey;
    try {
      reservationPda = new PublicKey(pdaRaw);
    } catch {
      return json(
        { ok: false, message: "reservationPda no es una pubkey válida." },
        400
      );
    }

    // 1. Verificar estado on-chain
    const connection = getConnection();
    const program = getProgram(connection);

    const reservation = await program.account.turnReservation.fetchNullable(
      reservationPda
    );

    if (!reservation) {
      return json(
        {
          ok: false,
          message: "TurnReservation no encontrada. Verifica la PDA y el cluster.",
        },
        404
      );
    }

    if (!reservation.isVerified) {
      return json(
        {
          ok: false,
          message:
            "La reserva aún no está verificada on-chain. Espera a que el sender firme mark_verified.",
        },
        412
      );
    }

    // Usar amountUSDC del body o convertir desde raw on-chain (6 decimales USDC)
    const rawAmount = reservation.amount.toNumber();
    const amountUSDC = body.amountUSDC ?? rawAmount / 1_000_000;
    const walletSolana = reservation.receiver.toBase58();

    // 2. Generar audio TTS con ElevenLabs
    let audioBase64: string | null = null;
    let ttsError: string | null = null;

    if (isConfigured()) {
      try {
        const script = buildConfirmationScript(amountUSDC, storeName);
        audioBase64 = await textToSpeechBase64(script);
        console.log(
          `[notify/verified] Audio TTS generado para ${receiverWA} — ${amountUSDC} USDC`
        );
      } catch (err) {
        ttsError = err instanceof Error ? err.message : "ElevenLabs error";
        console.warn("[notify/verified] TTS falló, continuando sin audio:", ttsError);
      }
    } else {
      ttsError = "ELEVENLABS_API_KEY no configurada — operando sin audio";
      console.warn("[notify/verified]", ttsError);
    }

    // 3. Notificar a Render/LidIA (WhatsApp) si está configurado
    let renderNotified = false;
    let renderError: string | null = null;

    if (RENDER_BACKEND_URL) {
      try {
        const renderBody: Record<string, unknown> = {
          walletSolana,
          userWA: receiverWA,
          amountUSDC,
          reservationPda: pdaRaw,
          txSignature: txSignature ?? null,
          isVerified: true,
        };

        if (audioBase64) {
          renderBody.audioBase64 = audioBase64;
        }

        const renderRes = await fetch(`${RENDER_BACKEND_URL}/api/lidia/notify`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(renderBody),
          signal: AbortSignal.timeout(15_000),
        });

        if (renderRes.ok) {
          renderNotified = true;
          console.log(`[notify/verified] Render notificado → ${receiverWA}`);
        } else {
          renderError = `Render ${renderRes.status}: ${await renderRes.text()}`;
          console.warn("[notify/verified] Render error:", renderError);
        }
      } catch (err) {
        renderError = err instanceof Error ? err.message : "Render fetch error";
        console.warn("[notify/verified] Render no disponible:", renderError);
      }
    }

    // 4. Respuesta
    return json({
      ok: true,
      reservationPda: pdaRaw,
      walletSolana,
      amountUSDC,
      isVerified: true,
      tts: {
        generated: audioBase64 !== null,
        error: ttsError,
        // Solo devolver base64 si Render no pudo notificar (evitar payloads enormes)
        audioBase64: !renderNotified && audioBase64 ? audioBase64 : undefined,
      },
      whatsapp: {
        sent: renderNotified,
        to: receiverWA,
        error: renderError,
      },
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Unknown error";
    console.error("[POST /api/notify/verified] error:", err);
    return json({ ok: false, message }, 500);
  }
}
