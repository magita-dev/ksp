/**
 * Local development HTTP server for the orchestrator.
 *
 * Listens on port 3001 and exposes POST /api/query so the Next.js frontend
 * can reach the LangGraph pipeline without deploying to Catalyst.
 */

import { createServer, type IncomingMessage, type ServerResponse } from "http";

process.env.LOCAL_DEV = "1";

// eslint-disable-next-line @typescript-eslint/no-require-imports
const handler = require("../index") as (
  req: IncomingMessage,
  res: ServerResponse
) => Promise<void>;

const PORT = Number(process.env.ORCHESTRATOR_PORT ?? 3001);

const server = createServer((req, res) => {
  const url = req.url ?? "";

  if (req.method === "OPTIONS") {
    res.writeHead(204, {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "POST, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type, catalyst-user-id, cookie",
    });
    res.end();
    return;
  }

  if (req.method === "GET" && (url === "/" || url === "/health")) {
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ status: "ok", service: "ksp-crime-ai-orchestrator" }));
    return;
  }

  if (url.startsWith("/api/query")) {
    void handler(req, res);
    return;
  }

  res.writeHead(404, { "Content-Type": "application/json" });
  res.end(JSON.stringify({ error: "Not Found" }));
});

server.listen(PORT, () => {
  console.log(`[orchestrator] Local dev server running at http://localhost:${PORT}`);
  console.log(`[orchestrator] POST queries to http://localhost:${PORT}/api/query`);
});
