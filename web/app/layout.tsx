import type { Metadata } from "next";
import type { ReactNode } from "react";

export const metadata: Metadata = {
  title: "Remesa LiquidezIA",
  description:
    "Turn-based escrow on Solana bridging digital remittances with physical cash-out at whitelisted merchants.",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="es">
      <body
        style={{
          fontFamily:
            "ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, sans-serif",
          margin: 0,
          background: "#0b0d12",
          color: "#e7e9ee",
        }}
      >
        {children}
      </body>
    </html>
  );
}
