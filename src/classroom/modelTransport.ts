import { atStage, parseRuntimeJson, RuntimeFailure } from "./runtimeSafety.js";

// Non-streaming Responses API only. Bound bytes before parsing; never log raw payloads.
export function guardedModelFetch(stage: string, fetcher: typeof fetch = fetch, onFailure: (error: unknown) => void = () => {}): typeof fetch {
  return async (input, init) => {
    try {
      const response = await atStage(`${stage}.http`, () => fetcher(input, init));
      if (!response.ok) {
        await response.body?.cancel().catch(() => {});
        throw new RuntimeFailure(`${stage}.http`, "http_error", response.status);
      }
      if (!response.body) throw new RuntimeFailure(`${stage}.body`, "empty_body", response.status, 0);
      const reader = response.body.getReader();
      const chunks: Uint8Array[] = [];
      let bytes = 0;
      try {
        while (true) {
          const item = await atStage(`${stage}.body`, () => reader.read());
          if (item.done) break;
          bytes += item.value.byteLength;
          if (bytes > 8 * 1024 * 1024) {
            await reader.cancel().catch(() => {});
            throw new RuntimeFailure(`${stage}.body`, "invalid_shape", response.status, bytes);
          }
          chunks.push(item.value);
        }
      } finally { reader.releaseLock(); }
      const raw = Buffer.concat(chunks).toString("utf8");
      const parsed = parseRuntimeJson(raw, `${stage}.json`);
      if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) throw new RuntimeFailure(`${stage}.json`, "invalid_shape");
      // The SDK receives only complete, validated JSON, never an empty transport body.
      return new Response(raw, { status: response.status, headers: { "content-type": "application/json" } });
    } catch (error) {
      onFailure(error); // Caller can recover this cause if the SDK wraps it as a connection error.
      throw error;
    }
  };
}
