/**
 * Catalyst Zia Text Analytics client — thin wrapper around the Zia REST API.
 * This is a non-critical path: if Zia is unavailable the caller falls back
 * to raw MO features only and annotates the reasoning trace with
 * `zia_enrichment: "unavailable"`.
 */

import { ZiaEntity } from "../types";

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

/**
 * Injectable fetcher type — allows tests (and future callers) to swap out the
 * real Zia HTTP call for a mock without monkey-patching modules.
 */
export type ZiaFetcher = (text: string) => Promise<ZiaEntity[]>;

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

/**
 * Resolve the auth token to include in the Zia REST request.
 * Preference order:
 *  1. Token obtained from the Catalyst app instance (if it exposes one)
 *  2. CATALYST_ZCQL_TOKEN environment variable (CI / local dev fallback)
 */
function resolveToken(app: unknown): string {
  if (app !== null && app !== undefined && typeof app === "object") {
    // The Catalyst SDK typically exposes a credential accessor like
    // app.getCredential()?.getToken() or similar — guard defensively since
    // the exact shape depends on the SDK version loaded at runtime.
    const maybeApp = app as Record<string, unknown>;
    if (typeof maybeApp["getCredential"] === "function") {
      try {
        const cred = (maybeApp["getCredential"] as () => unknown)();
        if (
          cred !== null &&
          cred !== undefined &&
          typeof cred === "object" &&
          typeof (cred as Record<string, unknown>)["getToken"] === "function"
        ) {
          const token = (
            (cred as Record<string, unknown>)["getToken"] as () => unknown
          )();
          if (typeof token === "string" && token.length > 0) {
            return token;
          }
        }
      } catch {
        // Swallow — fall through to env var
      }
    }
  }

  return process.env["CATALYST_ZCQL_TOKEN"] ?? "";
}

/**
 * Shape of a single entity object returned by Catalyst Zia's
 * `text-analytics/entity` endpoint.
 * The API returns an array under the `output` key.
 */
interface ZiaApiEntityItem {
  entity?: string;
  entity_type?: string;
  confidence?: number;
}

interface ZiaApiResponse {
  status?: string;
  output?: ZiaApiEntityItem[];
}

// ---------------------------------------------------------------------------
// Primary export
// ---------------------------------------------------------------------------

/**
 * Extract named entities from `text` using Catalyst Zia Text Analytics.
 *
 * On any failure (network error, non-2xx status, malformed response) the
 * function returns an empty array — callers MUST treat an empty result as
 * "Zia unavailable" rather than "no entities found in the text".
 *
 * @param text  Free-text content to analyse (e.g. a case narrative).
 * @param app   Catalyst app context used to obtain the auth token; pass
 *              `null` / `undefined` to fall back to the env-var token.
 */
export async function extractEntities(
  text: string,
  app: unknown
): Promise<ZiaEntity[]> {
  try {
    const token = resolveToken(app);

    const response = await fetch(
      "https://zia.catalyst.zoho.com/api/v2/entity",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(token ? { Authorization: `Zoho-oauthtoken ${token}` } : {}),
        },
        body: JSON.stringify({ text }),
      }
    );

    if (!response.ok) {
      throw new Error(
        `Zia API returned HTTP ${response.status}: ${response.statusText}`
      );
    }

    const data = (await response.json()) as ZiaApiResponse;

    if (!Array.isArray(data.output)) {
      return [];
    }

    const entities: ZiaEntity[] = data.output
      .filter(
        (item): item is ZiaApiEntityItem =>
          typeof item === "object" && item !== null
      )
      .map((item) => ({
        // Map Zia's `entity` / `entity_type` fields onto the canonical
        // ZiaEntity shape defined in types.ts (value / type / confidence).
        value: item.entity ?? "",
        type: item.entity_type ?? "UNKNOWN",
        confidence: item.confidence,
      }))
      .filter((e) => e.value.length > 0);

    return entities;
  } catch (err) {
    console.warn("[ZiaClient] Entity extraction unavailable:", err);
    return [];
  }
}
