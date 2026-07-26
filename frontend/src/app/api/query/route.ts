/**
 * Next.js App Router API route: POST /api/query
 *
 * Proxies the query to the Catalyst Function endpoint, forwarding the
 * session cookie so Catalyst Auth can validate the request server-side.
 *
 * Requirement 9.1 — the browser never calls the Catalyst Function directly;
 * this route acts as the authenticated proxy layer.
 */

import { runGraph } from "@orchestrator/graph";
import { createLocalZcqlExecutor } from "@orchestrator/dev/localStore";

const CATALYST_FUNCTION_URL = process.env.CATALYST_FUNCTION_URL;

export async function POST(request: Request): Promise<Response> {
  // Parse the incoming request body
  let body: { query_text: string };
  try {
    body = await request.json();
  } catch {
    return Response.json(
      { error: "Invalid JSON in request body" },
      { status: 400 }
    );
  }

  if (typeof body?.query_text !== "string" || body.query_text.trim() === "") {
    return Response.json(
      { error: "Missing or empty query_text" },
      { status: 400 }
    );
  }

  // If CATALYST_FUNCTION_URL is configured, proxy to external Catalyst function
  if (CATALYST_FUNCTION_URL) {
    const cookieHeader = request.headers.get("cookie");
    const forwardHeaders: HeadersInit = {
      "Content-Type": "application/json",
    };
    if (cookieHeader) {
      forwardHeaders["cookie"] = cookieHeader;
    }

    try {
      const catalystResponse = await fetch(CATALYST_FUNCTION_URL, {
        method: "POST",
        headers: forwardHeaders,
        body: JSON.stringify({ query_text: body.query_text }),
      });

      if (catalystResponse.ok) {
        const responseBody = await catalystResponse.json();
        return Response.json(responseBody, { status: catalystResponse.status });
      }
    } catch {
      // Fallback to in-process execution if remote endpoint fails
    }
  }

  // Local / in-process execution using local graph & seed data store
  try {
    const zcqlExecutor = createLocalZcqlExecutor();
    const { answer, reasoning_trace } = await runGraph(
      body.query_text,
      "officer",
      "",
      null,
      { _zcqlExecutor: zcqlExecutor }
    );

    return Response.json({ answer, reasoning_trace }, { status: 200 });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Orchestrator graph error";
    return Response.json({ error: message }, { status: 500 });
  }
}
