/**
 * Backend API + Blinks - Remesa Blink
 * Un solo servidor: suscripciones, cashback, Blinks
 */
import { app } from "./app.js";

const PORT = process.env.PORT || 3000;

app.listen(PORT, () => {
  console.log(`Backend+Blinks en http://localhost:${PORT}`);
  if (process.env.RUN_KEEPER === "true") {
    import("./keeper/cron.js").then(() => console.log("Keeper iniciado (integrado)"));
  }
});
