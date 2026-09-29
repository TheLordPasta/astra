// Browser and Node-testable transport. Never expose response bodies or fetch errors.
export class ClassroomApiError extends Error {
  constructor(stage, kind, status, reference) {
    const reasons = {
      empty_body: "the server returned an empty response",
      invalid_json: "the server returned incomplete or unreadable data",
      invalid_shape: "the server returned an unexpected response format",
      http_error: "the server could not complete the request",
      aborted: "the request was interrupted",
      network_error: "the connection to the server failed",
    };
    super(`I encountered a problem during ${stage}: ${reasons[kind] || reasons.http_error}.${status ? ` HTTP ${status}.` : ""}${reference ? ` Reference: ${reference}.` : ""}`);
    this.status = status;
    this.stage = stage;
    this.kind = kind;
  }
}
function stageFor(path) {
  if (/^\/api\/sessions\/\d+\/messages$/.test(path)) return "sending your message";
  if (path === "/api/lessons") return "loading lessons";
  if (path === "/api/insights") return "loading insights";
  return "loading the conversation";
}
export async function classroomRequest(path, options = {}, fetcher = fetch) {
  const stage = stageFor(path);
  let response;
  try { response = await fetcher(path, options); }
  catch (error) { throw new ClassroomApiError(stage, error?.name === "AbortError" ? "aborted" : "network_error"); }
  let text;
  try { text = await response.text(); }
  catch { throw new ClassroomApiError(stage, "aborted", response.status); }
  let body;
  if (!response.ok) {
    // Status remains available even for HTML, empty and truncated proxy errors.
    try { body = JSON.parse(text); } catch { /* Do not leak raw parsing errors. */ }
    const reference = typeof body?.reference === "string" && /^[a-f0-9-]{36}$/.test(body.reference) ? body.reference : undefined;
    throw new ClassroomApiError(stage, "http_error", response.status, reference);
  }
  if (!text.trim()) throw new ClassroomApiError(stage, "empty_body", response.status);
  try { body = JSON.parse(text); }
  catch { throw new ClassroomApiError(stage, "invalid_json", response.status); }
  const list = ["/api/sessions", "/api/lessons", "/api/insights"].includes(path) && (!options.method || options.method === "GET");
  const message = /^\/api\/sessions\/\d+\/messages$/.test(path);
  if (list ? !Array.isArray(body) : !body || typeof body !== "object" || Array.isArray(body)) {
    throw new ClassroomApiError(stage, "invalid_shape", response.status);
  }
  if (message && (typeof body.response !== "string" || !body.response.trim())) throw new ClassroomApiError(stage, "invalid_shape", response.status);
  return body;
}
export function uiErrorMessage(error) {
  return error instanceof ClassroomApiError ? error.message : "I encountered an unexpected Classroom interface problem.";
}
export function messageFailureText(error, completed) {
  const safe = uiErrorMessage(error);
  return completed ? `The response completed, but refreshing failed: ${safe}` :
    `${safe} Work may already have been saved or performed. Reopen the conversation and check before resending. This local notice does not confirm whether the work completed or was saved.`;
}
