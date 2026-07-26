import type { IncomingMessage, ServerResponse } from "http";
import type { ReasoningTrace } from "./types";
import { runGraph } from "./graph";

/**
 * Catalyst Advanced I/O Function entry point.
 *
 * Handles POST /api/query.
 * All orchestration logic now runs through the LangGraph graph (task 8.2).
 *
 * Requirements: 2.1, 2.2, 6.1, 6.2, 6.3, 6.4
 *               9.2 (host all orchestration inside Catalyst Advanced I/O Functions)
 *               5.3 (deny access to unauthenticated sessions)
 */

interface QueryRequestBody {
  query_text: string;
}

interface QueryResponseBody {
  answer: string;
  reasoning_trace: Partial<ReasoningTrace>;
}

interface ErrorResponseBody {
  error: string;
}

/**
 * Read the full request body as a string.
 */
function readBody(req: IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    let data = "";
    req.on("data", (chunk: Buffer) => {
      data += chunk.toString();
    });
    req.on("end", () => resolve(data));
    req.on("error", reject);
  });
}

/**
 * Parse the "cookie" header and return the value for the given key,
 * or undefined if not present.
 */
function parseCookie(cookieHeader: string, key: string): string | undefined {
  for (const part of cookieHeader.split(";")) {
    const [k, v] = part.trim().split("=");
    if (k.trim() === key) {
      return v ? v.trim() : "";
    }
  }
  return undefined;
}

/**
 * Determine whether the incoming request carries a valid Catalyst Auth session.
 *
 * Catalyst sets the `zscsession` cookie after login. Some internal service-to-
 * service calls use the `catalyst-user-id` header instead. Either presence is
 * sufficient for this stub validation; real token verification will be added in
 * a later task when the Catalyst SDK is wired in.
 */
function isAuthenticated(req: IncomingMessage): boolean {
  // Check for catalyst-user-id header (service-to-service / test path)
  const userIdHeader = req.headers["catalyst-user-id"];
  if (userIdHeader && typeof userIdHeader === "string" && userIdHeader.trim() !== "") {
    return true;
  }

  // Check for Catalyst session cookie (browser path)
  const cookieHeader = req.headers["cookie"];
  if (cookieHeader) {
    const sessionValue = parseCookie(cookieHeader, "zscsession");
    if (sessionValue !== undefined && sessionValue !== "") {
      return true;
    }
  }

  return false;
}

/**
 * Extract a user ID from the request for the audit trail.
 */
function extractUserId(req: IncomingMessage): string {
  const userIdHeader = req.headers["catalyst-user-id"];
  if (typeof userIdHeader === "string" && userIdHeader.trim() !== "") {
    return userIdHeader.trim();
  }
  const cookieHeader = req.headers["cookie"];
  if (cookieHeader) {
    const session = parseCookie(cookieHeader, "zscsession");
    if (session) return `session:${session.slice(0, 8)}`;
  }
  return "anonymous";
}

/**
 * Send a JSON response.
 */
function sendJson(
  res: ServerResponse,
  statusCode: number,
  body: QueryResponseBody | ErrorResponseBody
): void {
  const payload = JSON.stringify(body);
  res.writeHead(statusCode, {
    "Content-Type": "application/json",
    "Content-Length": Buffer.byteLength(payload),
  });
  res.end(payload);
}

/**
 * Main Catalyst Advanced I/O Function handler.
 *
 * Catalyst calls this with (req, res) — the same signature as a Node.js HTTP
 * handler. The export format `module.exports = handler` matches the Catalyst
 * Advanced I/O Function contract.
 */
async function handler(req: IncomingMessage, res: ServerResponse): Promise<void> {
  // Only accept POST /api/query; reject everything else with 405
  if (req.method?.toUpperCase() !== "POST") {
    sendJson(res, 405, { error: "Method Not Allowed" });
    return;
  }

  // Requirement 5.3: deny unauthenticated sessions before any agent logic runs
  if (!isAuthenticated(req)) {
    sendJson(res, 401, { error: "Unauthorized" });
    return;
  }

  // Parse and validate request body
  let body: QueryRequestBody;
  try {
    const raw = await readBody(req);
    const parsed: unknown = JSON.parse(raw);
    if (
      typeof parsed !== "object" ||
      parsed === null ||
      typeof (parsed as Record<string, unknown>)["query_text"] !== "string" ||
      ((parsed as Record<string, unknown>)["query_text"] as string).trim() === ""
    ) {
      sendJson(res, 400, { error: "Bad Request: query_text must be a non-empty string" });
      return;
    }
    body = parsed as QueryRequestBody;
  } catch {
    sendJson(res, 400, { error: "Bad Request: invalid JSON body" });
    return;
  }

  const { query_text } = body;
  const userId = extractUserId(req);

  // Run the full LangGraph orchestration pipeline (Requirements 6.1, 6.2, 6.3, 6.4)
  // `app` is null here until the Catalyst SDK is wired in.
  const { answer, reasoning_trace } = await runGraph(
    query_text,
    userId,
    "",   // token — will be populated when Catalyst SDK is wired
    null  // app
  );

  sendJson(res, 200, { answer, reasoning_trace });
}

// Catalyst Advanced I/O Function export
module.exports = handler;
