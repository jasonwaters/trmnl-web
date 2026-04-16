const DEV_LOG_ENDPOINT = "/__trmnl_debug_log";

type DebugDetails = Record<string, unknown> | undefined;

function safeSerialize(details: DebugDetails): string | null {
  if (!details) {
    return null;
  }

  try {
    return JSON.stringify(details);
  } catch {
    return JSON.stringify({ error: "Failed to serialize debug details." });
  }
}

export function debugLog(message: string, details?: DebugDetails): void {
  const timestamp = new Date().toISOString();
  const payload = safeSerialize(details);

  if (payload) {
    console.log(`[TRMNL DEBUG ${timestamp}] ${message}`, details);
  } else {
    console.log(`[TRMNL DEBUG ${timestamp}] ${message}`);
  }

  if (!import.meta.env.DEV) {
    return;
  }

  const body = JSON.stringify({ timestamp, message, details: details ?? null });

  void fetch(DEV_LOG_ENDPOINT, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body,
    keepalive: true,
  }).catch(() => {
    // Avoid recursive logging if debug endpoint is unavailable.
  });
}
