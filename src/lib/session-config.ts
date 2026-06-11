// Edge-sichere Session-Konstanten: keine DB-/node:crypto-Imports, damit sie
// sowohl im Data-Layer (src/lib/session.ts) als auch in der Edge-Middleware
// (middleware.ts) verwendet werden können. Einzige Quelle der Wahrheit für die
// Session-Laufzeit.
export const SESSION_TTL_MS = 1000 * 60 * 60 * 24 * 30; // 30 Tage
export const SESSION_TTL_SECONDS = SESSION_TTL_MS / 1000;
