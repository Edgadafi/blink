/**
 * Tests Keeper - ejecutarPagos con mocks
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("../src/db/pool.js", () => ({
  default: {
    query: vi.fn(),
  },
}));

vi.mock("../src/services/suscripciones.js", () => ({
  listarSuscripcionesPendientesPago: vi.fn(),
  actualizarSuscripcionDespuesPago: vi.fn(),
}));

vi.mock("../src/services/cashback.js", () => ({
  registrarCashbackPorRemesa: vi.fn(),
}));

vi.mock("../src/services/solana.js", () => ({
  ejecutarPagoOnChain: vi.fn().mockResolvedValue("tx-sig-123"),
  ejecutarPagoUsdcOnChain: vi.fn().mockResolvedValue("tx-sig-usdc-456"),
  getKeeperKeypair: vi.fn().mockReturnValue({
    publicKey: { toBase58: () => "KeeperPubkey111111111111111111111111111" },
  }),
}));

vi.mock("../src/services/notificaciones.js", () => ({
  enviarNotificacionPago: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("node-cron", () => ({
  default: {
    schedule: vi.fn(),
  },
}));

// Importar después de mocks
const { ejecutarPagos } = await import("../src/keeper/cron.js");
const { listarSuscripcionesPendientesPago } = await import("../src/services/suscripciones.js");
const { actualizarSuscripcionDespuesPago } = await import("../src/services/suscripciones.js");
const { registrarCashbackPorRemesa } = await import("../src/services/cashback.js");
const { ejecutarPagoOnChain, ejecutarPagoUsdcOnChain } = await import("../src/services/solana.js");
const { enviarNotificacionPago } = await import("../src/services/notificaciones.js");
const pool = (await import("../src/db/pool.js")).default;

describe("Keeper - ejecutarPagos", () => {
  beforeEach(() => {
    vi.mocked(listarSuscripcionesPendientesPago).mockResolvedValue([]);
    vi.mocked(pool.query).mockResolvedValue({ rows: [] } as never);
    vi.clearAllMocks();
  });

  it("cuando listarSuscripcionesPendientesPago retorna no-array no itera", async () => {
    vi.mocked(listarSuscripcionesPendientesPago).mockResolvedValue(null as never);

    await ejecutarPagos();

    expect(ejecutarPagoOnChain).not.toHaveBeenCalled();
    expect(ejecutarPagoUsdcOnChain).not.toHaveBeenCalled();
  });

  it("sin pendientes no ejecuta pagos", async () => {
    vi.mocked(listarSuscripcionesPendientesPago).mockResolvedValue([]);

    await ejecutarPagos();

    expect(ejecutarPagoOnChain).not.toHaveBeenCalled();
    expect(ejecutarPagoUsdcOnChain).not.toHaveBeenCalled();
    expect(actualizarSuscripcionDespuesPago).not.toHaveBeenCalled();
  });

  it("con pendiente SOL ejecuta pago y actualiza", async () => {
    vi.mocked(listarSuscripcionesPendientesPago).mockResolvedValue([
      {
        id: "susc-1",
        tipo_activo: "SOL",
        frecuencia: "diario",
        monto: "1000000000",
        destinatario_solana: "HN7cABqLq46Es1jh92dQQisAq662SmxELLLsHHe4YWrH",
        destinatario_wa: "5215551234567",
        remitente_wa: "5215550000000",
      },
    ]);

    await ejecutarPagos();

    expect(ejecutarPagoOnChain).toHaveBeenCalledTimes(1);
    expect(ejecutarPagoUsdcOnChain).not.toHaveBeenCalled();
    expect(actualizarSuscripcionDespuesPago).toHaveBeenCalledWith(
      "susc-1",
      expect.any(Date),
      expect.any(Date)
    );
    expect(registrarCashbackPorRemesa).toHaveBeenCalledWith(
      "5215550000000",
      1,
      "susc-1"
    );
    expect(enviarNotificacionPago).toHaveBeenCalledWith(
      expect.objectContaining({
        destinatario_wa: "5215551234567",
        remitente_wa: "5215550000000",
        montoHuman: 1,
        tipo_activo: "SOL",
      })
    );
  });

  it("con pendiente USDC ejecuta pago USDC y consulta beneficiarios_etherfuse", async () => {
    vi.mocked(listarSuscripcionesPendientesPago).mockResolvedValue([
      {
        id: "susc-2",
        tipo_activo: "USDC",
        frecuencia: "diario",
        monto: "1000000",
        destinatario_solana: "HN7cABqLq46Es1jh92dQQisAq662SmxELLLsHHe4YWrH",
        destinatario_wa: "5215559876543",
        remitente_wa: "5215550000000",
      },
    ]);
    vi.mocked(pool.query).mockResolvedValue({ rows: [] } as never); // sin KYC

    await ejecutarPagos();

    expect(ejecutarPagoUsdcOnChain).toHaveBeenCalledTimes(1);
    expect(ejecutarPagoOnChain).not.toHaveBeenCalled();
    expect(pool.query).toHaveBeenCalledWith(
      expect.stringContaining("beneficiarios_etherfuse"),
      ["HN7cABqLq46Es1jh92dQQisAq662SmxELLLsHHe4YWrH"]
    );
    expect(enviarNotificacionPago).toHaveBeenCalledWith(
      expect.objectContaining({
        montoHuman: 1,
        tipo_activo: "USDC",
        blinkOnboarding: expect.any(String),
      })
    );
  });

  it("con USDC y KYC verified incluye blink convertir-mxn", async () => {
    vi.mocked(listarSuscripcionesPendientesPago).mockResolvedValue([
      {
        id: "susc-3",
        tipo_activo: "USDC",
        frecuencia: "semanal",
        monto: "5000000",
        destinatario_solana: "HN7cABqLq46Es1jh92dQQisAq662SmxELLLsHHe4YWrH",
        destinatario_wa: "5215551111111",
        remitente_wa: "5215550000000",
      },
    ]);
    vi.mocked(pool.query).mockResolvedValue({ rows: [{ 1: 1 }] } as never); // kyc verified

    process.env.BLINKS_BASE_URL = "https://test.example.com";

    await ejecutarPagos();

    expect(enviarNotificacionPago).toHaveBeenCalledWith(
      expect.objectContaining({
        blinkUrl: "https://test.example.com/api/actions/convertir-mxn?amount=5",
        blinkOnboarding: null,
      })
    );

    delete process.env.BLINKS_BASE_URL;
  });

  it("en error de suscripción no detiene el loop", async () => {
    vi.mocked(listarSuscripcionesPendientesPago).mockResolvedValue([
      { id: "susc-fail", tipo_activo: "SOL", frecuencia: "diario", monto: "1000000000", destinatario_solana: "HN7cABqLq46Es1jh92dQQisAq662SmxELLLsHHe4YWrH", destinatario_wa: "521", remitente_wa: "520" },
      { id: "susc-ok", tipo_activo: "SOL", frecuencia: "diario", monto: "1000000000", destinatario_solana: "HN7cABqLq46Es1jh92dQQisAq662SmxELLLsHHe4YWrH", destinatario_wa: "5215551234567", remitente_wa: "5215550000000" },
    ]);
    vi.mocked(ejecutarPagoOnChain)
      .mockRejectedValueOnce(new Error("RPC error"))
      .mockResolvedValueOnce("tx-ok");

    await ejecutarPagos();

    expect(ejecutarPagoOnChain).toHaveBeenCalledTimes(2);
    expect(actualizarSuscripcionDespuesPago).toHaveBeenCalledTimes(1); // solo susc-ok
  });

  it("cuando ejecutarPagoUsdcOnChain falla no actualiza ni notifica", async () => {
    vi.mocked(listarSuscripcionesPendientesPago).mockResolvedValue([
      {
        id: "susc-usdc-fail",
        tipo_activo: "USDC",
        frecuencia: "diario",
        monto: "1000000",
        destinatario_solana: "HN7cABqLq46Es1jh92dQQisAq662SmxELLLsHHe4YWrH",
        destinatario_wa: "5215559876543",
        remitente_wa: "5215550000000",
      },
    ]);
    vi.mocked(ejecutarPagoUsdcOnChain).mockRejectedValue(new Error("USDC transfer failed"));

    await ejecutarPagos();

    expect(actualizarSuscripcionDespuesPago).not.toHaveBeenCalled();
    expect(registrarCashbackPorRemesa).not.toHaveBeenCalled();
    expect(enviarNotificacionPago).not.toHaveBeenCalled();
  });

  it("sin BLINKS_BASE_URL pasa blinkUrl y blinkOnboarding null en notificación SOL", async () => {
    const orig = process.env.BLINKS_BASE_URL;
    delete process.env.BLINKS_BASE_URL;
    delete process.env.BASE_URL;

    vi.mocked(listarSuscripcionesPendientesPago).mockResolvedValue([
      {
        id: "susc-sol-no-base",
        tipo_activo: "SOL",
        frecuencia: "diario",
        monto: "1000000000",
        destinatario_solana: "HN7cABqLq46Es1jh92dQQisAq662SmxELLLsHHe4YWrH",
        destinatario_wa: "5215551234567",
        remitente_wa: "5215550000000",
      },
    ]);

    await ejecutarPagos();

    expect(enviarNotificacionPago).toHaveBeenCalledWith(
      expect.objectContaining({
        blinkUrl: null,
      })
    );
    expect(enviarNotificacionPago.mock.calls[0][0].blinkOnboarding).toBeNull();

    if (orig !== undefined) process.env.BLINKS_BASE_URL = orig;
  });

  it("frecuencia mensual ejecuta pago y proximo es ~30 días", async () => {
    vi.mocked(listarSuscripcionesPendientesPago).mockResolvedValue([
      {
        id: "susc-mensual",
        tipo_activo: "SOL",
        frecuencia: "mensual",
        monto: "5000000000",
        destinatario_solana: "HN7cABqLq46Es1jh92dQQisAq662SmxELLLsHHe4YWrH",
        destinatario_wa: "5215551234567",
        remitente_wa: "5215550000000",
      },
    ]);

    const before = new Date();
    await ejecutarPagos();
    const after = new Date();

    expect(actualizarSuscripcionDespuesPago).toHaveBeenCalledWith(
      "susc-mensual",
      expect.any(Date),
      expect.any(Date)
    );
    const [, now, proximo] = vi.mocked(actualizarSuscripcionDespuesPago).mock.calls[0];
    const diffDays = (proximo.getTime() - now.getTime()) / (1000 * 60 * 60 * 24);
    expect(diffDays).toBeGreaterThanOrEqual(28);
    expect(diffDays).toBeLessThanOrEqual(32);
  });

  it("si enviarNotificacionPago falla no rompe (actualización ya hecha)", async () => {
    vi.mocked(listarSuscripcionesPendientesPago).mockResolvedValue([
      {
        id: "susc-notify-fail",
        tipo_activo: "SOL",
        frecuencia: "diario",
        monto: "1000000000",
        destinatario_solana: "HN7cABqLq46Es1jh92dQQisAq662SmxELLLsHHe4YWrH",
        destinatario_wa: "5215551234567",
        remitente_wa: "5215550000000",
      },
    ]);
    vi.mocked(enviarNotificacionPago).mockRejectedValue(new Error("WhatsApp API down"));

    await ejecutarPagos();

    expect(actualizarSuscripcionDespuesPago).toHaveBeenCalledTimes(1);
  });
});
