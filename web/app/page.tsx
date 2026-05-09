export default function Home() {
  return (
    <main style={{ maxWidth: 720, margin: "0 auto", padding: "64px 24px" }}>
      <h1 style={{ fontSize: 32, marginBottom: 16, fontWeight: 800 }}>
        Remesa LiquidezIA
      </h1>
      <p style={{ opacity: 0.8, lineHeight: 1.6 }}>
        Solana Action endpoint para validar entregas de efectivo en comercios
        registrados.
      </p>
      <pre
        style={{
          marginTop: 24,
          background: "#11141b",
          padding: 16,
          borderRadius: 12,
          border: "1px solid #1f2430",
          overflowX: "auto",
        }}
      >
        GET /api/actions/cashout?pda={"<reservationPda>"}
      </pre>
    </main>
  );
}
