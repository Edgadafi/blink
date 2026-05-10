/**
 * Tests Blinks - actions.json, remesa, enviar-remesa, headers
 */
import { describe, it, expect } from "vitest";
import request from "supertest";
import { app } from "../src/app.js";

describe("Blinks - actions.json", () => {
  it("GET /actions.json devuelve array de acciones", async () => {
    const res = await request(app).get("/actions.json");
    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty("actions");
    expect(Array.isArray(res.body.actions)).toBe(true);
    expect(res.body.actions.length).toBeGreaterThanOrEqual(4);
  });

  it("incluye remesa y enviar-remesa en actions.json", async () => {
    const res = await request(app).get("/actions.json");
    const urls = res.body.actions.map((a: { url: string }) => a.url);
    expect(urls.some((u: string) => u.includes("/api/actions/remesa"))).toBe(true);
    expect(urls.some((u: string) => u.includes("/api/actions/enviar-remesa"))).toBe(true);
  });

  it("devuelve Access-Control-Allow-Origin: *", async () => {
    const res = await request(app).get("/actions.json");
    expect(res.headers["access-control-allow-origin"]).toBe("*");
  });

  it("devuelve X-Action-Version: 1", async () => {
    const res = await request(app).get("/actions.json");
    expect(res.headers["x-action-version"]).toBe("1");
  });

  it("OPTIONS /actions.json retorna 204", async () => {
    const res = await request(app).options("/actions.json");
    expect(res.status).toBe(204);
  });
});

describe("Blinks - GET remesa / enviar-remesa", () => {
  it("GET /api/actions/remesa devuelve metadata de Action", async () => {
    const res = await request(app).get("/api/actions/remesa");
    expect(res.status).toBe(200);
    expect(res.body.type).toBe("action");
    expect(res.body.title).toBe("Remesa Blink");
    expect(res.body.links?.actions?.[0]?.href).toContain("/api/actions/remesa");
    expect(res.body.links?.actions?.[0]?.parameters).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ name: "account", required: true }),
        expect.objectContaining({ name: "amount", required: true }),
        expect.objectContaining({ name: "destination", required: true }),
      ])
    );
  });

  it("GET /api/actions/enviar-remesa devuelve metadata con href enviar-remesa", async () => {
    const res = await request(app).get("/api/actions/enviar-remesa");
    expect(res.status).toBe(200);
    expect(res.body.links?.actions?.[0]?.href).toContain("/api/actions/enviar-remesa");
  });

  it("GET incluye header X-Action-Version", async () => {
    const res = await request(app).get("/api/actions/remesa");
    expect(res.headers["x-action-version"]).toBe("1");
  });
});

describe("Blinks - POST remesa", () => {
  const validWallet = "So11111111111111111111111111111111111111112";
  const validDest = "HN7cABqLq46Es1jh92dQQisAq662SmxELLLsHHe4YWrH";

  it("POST sin body retorna 400", async () => {
    const res = await request(app).post("/api/actions/remesa").send({});
    expect(res.status).toBe(400);
    expect(res.body.message).toContain("requeridos");
  });

  it("POST sin account retorna 400", async () => {
    const res = await request(app).post("/api/actions/remesa").send({
      amount: 0.01,
      destination: validDest,
    });
    expect(res.status).toBe(400);
  });

  it("POST con monto 0 retorna 400", async () => {
    const res = await request(app).post("/api/actions/remesa").send({
      account: validWallet,
      amount: 0,
      destination: validDest,
    });
    expect(res.status).toBe(400);
  });

  it("POST con monto menor al mínimo retorna 400", async () => {
    const res = await request(app).post("/api/actions/remesa").send({
      account: validWallet,
      amount: 0.0001,
      destination: validDest,
    });
    expect(res.status).toBe(400);
    expect(res.body.message).toContain("Monto mínimo");
  });

  it("POST con monto mayor al máximo retorna 400", async () => {
    const res = await request(app).post("/api/actions/remesa").send({
      account: validWallet,
      amount: 200,
      destination: validDest,
    });
    expect(res.status).toBe(400);
    expect(res.body.message).toContain("Monto máximo");
  });

  it("POST con datos válidos devuelve transaction base64", async () => {
    const res = await request(app).post("/api/actions/remesa").send({
      account: validWallet,
      amount: 0.01,
      destination: validDest,
    });

    if (res.status === 500 && res.body?.message?.includes("fetch")) {
      return; // RPC inaccesible en CI, skip
    }

    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty("transaction");
    expect(res.body).toHaveProperty("message");
    expect(typeof res.body.transaction).toBe("string");
    // base64: solo caracteres válidos
    expect(res.body.transaction).toMatch(/^[A-Za-z0-9+/]+=*$/);
  });
});

describe("Blinks - GET enviar-remesa-usdc, onboarding-mxn, convertir-mxn", () => {
  it("GET /api/actions/enviar-remesa-usdc devuelve metadata", async () => {
    const res = await request(app).get("/api/actions/enviar-remesa-usdc");
    expect(res.status).toBe(200);
    expect(res.body.type).toBe("action");
    expect(res.body.links?.actions?.[0]?.parameters).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ name: "account" }),
        expect.objectContaining({ name: "amount" }),
        expect.objectContaining({ name: "destination" }),
      ])
    );
  });

  it("GET /api/actions/onboarding-mxn devuelve metadata con param account", async () => {
    const res = await request(app).get("/api/actions/onboarding-mxn");
    expect(res.status).toBe(200);
    expect(res.body.links?.actions?.[0]?.parameters).toEqual(
      expect.arrayContaining([expect.objectContaining({ name: "account" })])
    );
  });

  it("GET /api/actions/convertir-mxn devuelve metadata", async () => {
    const res = await request(app).get("/api/actions/convertir-mxn");
    expect(res.status).toBe(200);
    expect(res.body.type).toBe("action");
  });
});

describe("Blinks - POST enviar-remesa-usdc", () => {
  const validWallet = "So11111111111111111111111111111111111111112";
  const validDest = "HN7cABqLq46Es1jh92dQQisAq662SmxELLLsHHe4YWrH";

  it("POST sin account retorna 400", async () => {
    const res = await request(app).post("/api/actions/enviar-remesa-usdc").send({
      amount: 1,
      destination: validDest,
    });
    expect(res.status).toBe(400);
    expect(res.body.message).toContain("account");
  });

  it("POST sin destination retorna 400", async () => {
    const res = await request(app).post("/api/actions/enviar-remesa-usdc").send({
      account: validWallet,
      amount: 1,
    });
    expect(res.status).toBe(400);
  });

  it("POST con monto inválido retorna 400", async () => {
    const res = await request(app).post("/api/actions/enviar-remesa-usdc").send({
      account: validWallet,
      amount: -1,
      destination: validDest,
    });
    expect(res.status).toBe(400);
  });

  it("POST con monto menor al mínimo USDC retorna 400", async () => {
    const res = await request(app).post("/api/actions/enviar-remesa-usdc").send({
      account: validWallet,
      amount: 0.5,
      destination: validDest,
    });
    expect(res.status).toBe(400);
    expect(res.body.message).toContain("Monto mínimo");
  });

  it("POST con monto mayor al máximo USDC retorna 400", async () => {
    const res = await request(app).post("/api/actions/enviar-remesa-usdc").send({
      account: validWallet,
      amount: 100000,
      destination: validDest,
    });
    expect(res.status).toBe(400);
    expect(res.body.message).toContain("Monto máximo");
  });
});

describe("Blinks - POST onboarding-mxn", () => {
  it("POST sin account retorna 400", async () => {
    const res = await request(app).post("/api/actions/onboarding-mxn").send({});
    expect(res.status).toBe(400);
    expect(res.body.message).toContain("account");
  });
});

describe("Blinks - POST convertir-mxn", () => {
  it("POST sin account retorna 400", async () => {
    const res = await request(app).post("/api/actions/convertir-mxn").send({
      amount: 10,
    });
    expect(res.status).toBe(400);
    expect(res.body.message).toContain("account");
  });
  it("POST sin amount retorna 400", async () => {
    const res = await request(app).post("/api/actions/convertir-mxn").send({
      account: "So11111111111111111111111111111111111111112",
    });
    expect(res.status).toBe(400);
  });

  it("POST con monto menor al mínimo USDC retorna 400", async () => {
    const res = await request(app).post("/api/actions/convertir-mxn").send({
      account: "So11111111111111111111111111111111111111112",
      amount: 0.5,
    });
    expect(res.status).toBe(400);
    expect(res.body.message).toContain("Monto mínimo");
  });
});
