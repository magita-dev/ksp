/**
 * IVR Catalyst Function — Twilio inbound call webhook
 *
 * Accepts Twilio <Gather> speech transcription via POST (application/x-www-form-urlencoded).
 * Routes the transcribed query through the KSP Crime AI orchestrator and returns a
 * TwiML <Say> response with the answer text.
 *
 * Key Twilio params received in the POST body:
 *   SpeechResult — the speech-to-text transcript from <Gather>
 *   Caller        — the caller's E.164 phone number (used as caller identity for audit)
 *
 * Orchestrator communication:
 *   Rather than importing across packages, this handler makes an HTTP call to the
 *   orchestrator Catalyst Function at the URL supplied by ORCHESTRATOR_URL env var
 *   (default: http://localhost:3001 for local development).
 *
 * Requirements: 12.1, 12.2, 12.3, 12.4
 */

import type { IncomingMessage, ServerResponse } from "http";
import * as http from "http";
import * as https from "https";
import { URL } from "url";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** Orchestrator response shape (mirrors the orchestrator's QueryResponseBody). */
interface OrchestratorResponse {
  answer: string;
  reasoning_trace?: unknown;
}

/** Parsed Twilio POST body fields we care about. */
interface TwilioBody {
  SpeechResult: string;
  Caller: string;
}

// ---------------------------------------------------------------------------
// Configuration
// ---------------------------------------------------------------------------

/**
 * Base URL for the orchestrator Catalyst Function.
 * Override with ORCHESTRATOR_URL env var in production; defaults to localhost for dev.
 */
function getOrchestratorUrl(): string {
  return process.env["ORCHESTRATOR_URL"] ?? "http://localhost:3001";
}

/**
 * Internal service token used to authenticate the IVR → orchestrator call.
 * In production, set IVR_SERVICE_TOKEN to a valid Catalyst service credential.
 */
function getServiceToken(): string {
  return process.env["IVR_SERVICE_TOKEN"] ?? "ivr-internal";
}

// ---------------------------------------------------------------------------
// TwiML helpers
// ---------------------------------------------------------------------------

/** Escape XML special characters in answer text to keep TwiML well-formed. */
function escapeXml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

/**
 * Build a TwiML <Response><Say> document.
 * The <Gather> verb is included to allow follow-up queries in the same call.
 */
function buildTwiML(answerText: string): string {
  const safeText = escapeXml(answerText);
  return (
    '<?xml version="1.0" encoding="UTF-8"?>' +
    "<Response>" +
    `<Say voice="alice" language="en-IN">${safeText}</Say>` +
    "</Response>"
  );
}

/**
 * Build a TwiML <Response><Say> error message, used when the orchestrator
 * is unreachable or returns an unexpected error.
 */
function buildErrorTwiML(message: string): string {
  return buildTwiML(message);
}

// ---------------------------------------------------------------------------
// URL-encoded body parser
// ---------------------------------------------------------------------------

/**
 * Parse an application/x-www-form-urlencoded body string into a plain object.
 * Values are URL-decoded. Only the fields we need (SpeechResult, Caller) are used.
 */
function parseFormBody(raw: string): Record<string, string> {
  const result: Record<string, string> = {};
  for (const pair of raw.split("&")) {
    const eqIdx = pair.indexOf("=");
    if (eqIdx === -1) continue;
    const key = decodeURIComponent(pair.slice(0, eqIdx).replace(/\+/g, " "));
    const value = decodeURIComponent(pair.slice(eqIdx + 1).replace(/\+/g, " "));
    result[key] = value;
  }
  return result;
}

/** Read the full request body as a UTF-8 string. */
function readBody(req: IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    let data = "";
    req.on("data", (chunk: Buffer) => {
      data += chunk.toString("utf-8");
    });
    req.on("end", () => resolve(data));
    req.on("error", reject);
  });
}

// ---------------------------------------------------------------------------
// Orchestrator HTTP client
// ---------------------------------------------------------------------------

/**
 * POST a query to the orchestrator function endpoint and return the parsed response.
 *
 * @param queryText   The investigator's (transcribed) query.
 * @param callerId    The caller's phone number (used as user identity in the audit trail).
 * @returns           The orchestrator's answer text.
 */
async function callOrchestrator(queryText: string, callerId: string): Promise<string> {
  const baseUrl = getOrchestratorUrl();
  const serviceToken = getServiceToken();

  const url = new URL("/api/query", baseUrl);
  const isHttps = url.protocol === "https:";
  const transport = isHttps ? https : http;

  const requestBody = JSON.stringify({ query_text: queryText });

  return new Promise<string>((resolve, reject) => {
    const options: http.RequestOptions = {
      hostname: url.hostname,
      port: url.port ? parseInt(url.port, 10) : (isHttps ? 443 : 80),
      path: url.pathname,
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Content-Length": Buffer.byteLength(requestBody),
        // Pass the caller ID as the user identity for the orchestrator audit trail.
        // The orchestrator reads this header to identify the user (Req 12.4).
        "catalyst-user-id": callerId || "ivr-anonymous",
        // IVR-specific metadata for audit enrichment
        "x-ivr-caller": callerId || "",
        "x-ivr-service-token": serviceToken,
      },
    };

    const req = transport.request(options, (res) => {
      let responseData = "";
      res.on("data", (chunk: Buffer) => {
        responseData += chunk.toString("utf-8");
      });
      res.on("end", () => {
        try {
          if (res.statusCode === 401) {
            resolve("I'm sorry, this service requires authentication. Please contact your administrator.");
            return;
          }
          if (!res.statusCode || res.statusCode >= 400) {
            resolve("I'm sorry, the system is temporarily unavailable. Please try again later.");
            return;
          }
          const parsed = JSON.parse(responseData) as OrchestratorResponse;
          resolve(parsed.answer ?? "Query processed successfully.");
        } catch {
          resolve("I'm sorry, I received an unexpected response. Please try again.");
        }
      });
    });

    req.on("error", (err) => {
      console.error("[IVR] Orchestrator request failed:", err);
      reject(err);
    });

    req.setTimeout(30000, () => {
      req.destroy(new Error("Orchestrator request timed out"));
    });

    req.write(requestBody);
    req.end();
  });
}

// ---------------------------------------------------------------------------
// Send TwiML response
// ---------------------------------------------------------------------------

function sendTwiML(res: ServerResponse, twiml: string, statusCode = 200): void {
  const payload = Buffer.from(twiml, "utf-8");
  res.writeHead(statusCode, {
    "Content-Type": "application/xml; charset=utf-8",
    "Content-Length": payload.length,
  });
  res.end(twiml);
}

// ---------------------------------------------------------------------------
// Main Catalyst Function handler
// ---------------------------------------------------------------------------

/**
 * Catalyst Advanced I/O Function handler — Twilio IVR webhook.
 *
 * Twilio POSTs to this webhook after a caller speaks into the <Gather> prompt.
 * The handler:
 *   1. Parses the URL-encoded body to extract SpeechResult and Caller.
 *   2. Calls the orchestrator function with the transcript as the query.
 *   3. Returns a TwiML <Say> response containing the answer.
 *
 * If no SpeechResult is present (caller was silent or hung up), returns a
 * prompt asking the caller to repeat their question.
 *
 * Requirements:
 *   12.1 — Accept Twilio <Gather> speech transcription
 *   12.2 — Route through the same LangGraph orchestrator pipeline
 *   12.3 — Return TwiML <Say> response with the answer text
 *   12.4 — Log IVR-sourced queries with caller identity (via orchestrator audit)
 */
async function handler(req: IncomingMessage, res: ServerResponse): Promise<void> {
  // Requirement 12.1 — only accept POST (Twilio always POSTs to webhooks)
  if (req.method?.toUpperCase() !== "POST") {
    sendTwiML(
      res,
      buildErrorTwiML("This endpoint only accepts POST requests from Twilio."),
      405
    );
    return;
  }

  let body: TwilioBody;
  try {
    const raw = await readBody(req);
    const parsed = parseFormBody(raw);
    body = {
      SpeechResult: (parsed["SpeechResult"] ?? "").trim(),
      Caller: (parsed["Caller"] ?? "").trim(),
    };
  } catch (err) {
    console.error("[IVR] Failed to read/parse request body:", err);
    sendTwiML(res, buildErrorTwiML("Sorry, there was a problem processing your request."));
    return;
  }

  const { SpeechResult: speechResult, Caller: caller } = body;

  // Requirement 12.1 — if no speech was detected, prompt the caller to try again
  if (!speechResult) {
    console.log("[IVR] No SpeechResult received (caller silent or <Gather> timed out).");
    sendTwiML(
      res,
      buildTwiML(
        "I did not hear your question. Please try again and speak clearly after the tone."
      )
    );
    return;
  }

  // Log the IVR query (caller identity is forwarded to the orchestrator for audit, Req 12.4)
  const callerLabel = caller || "unknown";
  console.log(`[IVR] Query from ${callerLabel}: "${speechResult}"`);

  // Requirement 12.2 — route through the orchestrator
  // Requirement 12.4 — caller identity passed as user ID for audit trail
  let answerText: string;
  try {
    answerText = await callOrchestrator(speechResult, callerLabel);
  } catch (err) {
    console.error("[IVR] Orchestrator call failed:", err);
    answerText = "I'm sorry, the system is temporarily unavailable. Please try again later.";
  }

  // Requirement 12.3 — return TwiML <Say> with the answer
  sendTwiML(res, buildTwiML(answerText));
}

// Catalyst Advanced I/O Function export format
module.exports = handler;
