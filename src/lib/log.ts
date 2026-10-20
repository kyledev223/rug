/** Server-side logging. Strips API keys that may appear in RPC URLs. */
function redact(s: string): string {
  return s.replace(/api-key=[A-Za-z0-9-]+/g, "api-key=***").replace(/key=[A-Za-z0-9_-]{20,}/g, "key=***");
}

export function logError(scope: string, err: unknown, extra?: Record<string, unknown>) {
  const msg = err instanceof Error ? `${err.name}: ${err.message}` : String(err);
  console.error(`[${scope}] ${redact(msg)}`, extra ? JSON.stringify(extra) : "");
}

export function logInfo(scope: string, msg: string) {
  console.info(`[${scope}] ${redact(msg)}`);
}
