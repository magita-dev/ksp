/**
 * Catalyst Cron — nightly re-indexing job
 *
 * Requirement 9.4: WHERE nightly re-indexing or batch processing is required,
 * THE System SHALL schedule the job using Catalyst Cron.
 *
 * Responsibilities:
 *  1. Query Cases rows added/updated since the previous run
 *     (defaults to 24 h ago on first execution — in-memory MVP, no persistent state).
 *  2. Call Catalyst Zia Text Analytics on each narrative to extract entities.
 *  3. Upsert MO_Features.zia_entities_json with the serialised entity array.
 *  4. Print a summary: cases processed, upserts succeeded.
 *
 * Export contract: `module.exports = handler` (Catalyst Cron function shape).
 */

import type { IncomingMessage, ServerResponse } from "http";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface ZiaEntity {
  value: string;
  type: string;
  confidence?: number;
}

/** Minimal shape of a Catalyst Data Store table proxy returned by app.datastore() */
interface CatalystTable {
  insertRow(data: Record<string, unknown>): Promise<{ status: string }>;
  updateRow(data: Record<string, unknown>): Promise<{ status: string }>;
  getRow(rowId: string | number): Promise<Record<string, unknown>>;
  deleteRow(rowId: string | number): Promise<{ status: string }>;
}

/** Minimal shape of a Catalyst Data Store proxy returned by app.datastore() */
interface CatalystDatastore {
  table(tableName: string): CatalystTable;
  executeQuery(zcql: string): Promise<Record<string, unknown>[]>;
}

/** Minimal Catalyst app context injected into Cron / Advanced I/O Functions */
interface CatalystApp {
  datastore(): CatalystDatastore;
  getCredential?: () => { getToken(): string } | null;
}

/** Row shape from the Cases table */
interface CaseRow {
  ROWID: string | number;
  case_id: string;
  narrative: string;
}

/** Row shape from MO_Features — enough to locate an existing record */
interface MOFeaturesRow {
  ROWID: string | number;
  case_id: string | number;
  zia_entities_json?: string;
}

// ---------------------------------------------------------------------------
// In-memory "last run" state (MVP — resets on cold start)
// ---------------------------------------------------------------------------

let lastRunAt: Date | null = null;

// ---------------------------------------------------------------------------
// Zia entity extraction
// ---------------------------------------------------------------------------

/**
 * Resolve the Catalyst auth token from the app context or the environment.
 */
function resolveToken(app: CatalystApp): string {
  if (typeof app.getCredential === "function") {
    try {
      const cred = app.getCredential();
      if (cred) {
        return cred.getToken();
      }
    } catch {
      // fall through
    }
  }
  return process.env["CATALYST_ZCQL_TOKEN"] ?? "";
}

/**
 * Call the Catalyst Zia Text Analytics REST API to extract named entities from
 * a free-text string. Returns an empty array on any failure (non-critical path).
 */
async function extractZiaEntities(
  text: string,
  token: string
): Promise<ZiaEntity[]> {
  if (!text || text.trim().length === 0) {
    return [];
  }

  try {
    const response = await fetch("https://zia.catalyst.zoho.com/api/v2/entity", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(token ? { Authorization: `Zoho-oauthtoken ${token}` } : {}),
      },
      body: JSON.stringify({ text }),
    });

    if (!response.ok) {
      console.warn(
        `[cron-reindex] Zia API returned HTTP ${response.status} for text excerpt: "${text.slice(0, 60)}…"`
      );
      return [];
    }

    const data = (await response.json()) as {
      status?: string;
      output?: Array<{
        entity?: string;
        entity_type?: string;
        confidence?: number;
      }>;
    };

    if (!Array.isArray(data.output)) {
      return [];
    }

    return data.output
      .filter((item) => typeof item === "object" && item !== null)
      .map((item) => ({
        value: item.entity ?? "",
        type: item.entity_type ?? "UNKNOWN",
        confidence: item.confidence,
      }))
      .filter((e) => e.value.length > 0);
  } catch (err) {
    console.warn("[cron-reindex] Zia extraction error:", err);
    return [];
  }
}

// ---------------------------------------------------------------------------
// Upsert helper
// ---------------------------------------------------------------------------

/**
 * Upsert zia_entities_json into the MO_Features row for the given case ROWID.
 *
 * Strategy:
 *  1. Query MO_Features for an existing row where case_id matches.
 *  2. If found → updateRow with the new JSON.
 *  3. If not found → insertRow with the case_id and JSON (other columns left blank).
 *
 * Returns true on success, false on any error.
 */
async function upsertZiaEntities(
  datastore: CatalystDatastore,
  caseRowId: string | number,
  entitiesJson: string
): Promise<boolean> {
  try {
    // Find existing MO_Features row for this case
    const existingRows = await datastore.executeQuery(
      `SELECT ROWID, case_id FROM MO_Features WHERE case_id = ${String(caseRowId)} LIMIT 1`
    );

    const moTable = datastore.table("MO_Features");

    if (existingRows.length > 0) {
      const existing = existingRows[0] as unknown as MOFeaturesRow;
      await moTable.updateRow({
        ROWID: existing.ROWID,
        zia_entities_json: entitiesJson,
      });
    } else {
      // No MO_Features row yet — insert a minimal one
      await moTable.insertRow({
        case_id: caseRowId,
        zia_entities_json: entitiesJson,
      });
    }

    return true;
  } catch (err) {
    console.error(
      `[cron-reindex] Failed to upsert MO_Features for case ROWID ${String(caseRowId)}:`,
      err
    );
    return false;
  }
}

// ---------------------------------------------------------------------------
// Main handler
// ---------------------------------------------------------------------------

/**
 * Catalyst Cron handler.
 * Catalyst Cron invokes this with the same (req, res) signature as Advanced I/O.
 */
async function handler(req: IncomingMessage, res: ServerResponse): Promise<void> {
  console.log("[cron-reindex] Nightly re-index started at", new Date().toISOString());

  // Determine the window start time
  const now = new Date();
  const windowStart: Date =
    lastRunAt !== null
      ? lastRunAt
      : new Date(now.getTime() - 24 * 60 * 60 * 1000); // default: 24 h ago

  console.log(
    `[cron-reindex] Querying Cases updated since ${windowStart.toISOString()}`
  );

  // Persist current time as the next run's window start
  lastRunAt = now;

  // Obtain the Catalyst app context injected by the Cron runtime
  const app: CatalystApp = (req as unknown as { catalyst: CatalystApp }).catalyst;

  const datastore = app.datastore();
  const token = resolveToken(app);

  // -------------------------------------------------------------------------
  // Step 1: Fetch Cases updated/added since windowStart
  // -------------------------------------------------------------------------

  const sinceDateStr = windowStart.toISOString().slice(0, 19).replace("T", " "); // 'YYYY-MM-DD HH:MM:SS'

  let cases: CaseRow[] = [];
  try {
    const rows = await datastore.executeQuery(
      `SELECT ROWID, case_id, narrative FROM Cases WHERE filed_date >= '${sinceDateStr}' LIMIT 200`
    );
    cases = rows.map((r) => r as unknown as CaseRow);
  } catch (err) {
    console.error("[cron-reindex] ZCQL query for Cases failed:", err);
    res.writeHead(500, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ error: "Cases query failed", details: String(err) }));
    return;
  }

  console.log(`[cron-reindex] ${cases.length} case(s) to process.`);

  // -------------------------------------------------------------------------
  // Step 2 & 3: For each case, extract Zia entities and upsert MO_Features
  // -------------------------------------------------------------------------

  let upsertSucceeded = 0;
  let upsertFailed = 0;

  for (const c of cases) {
    const narrative = c.narrative ?? "";
    const entities = await extractZiaEntities(narrative, token);
    const entitiesJson = JSON.stringify(entities);

    const success = await upsertZiaEntities(datastore, c.ROWID, entitiesJson);
    if (success) {
      upsertSucceeded++;
    } else {
      upsertFailed++;
    }
  }

  // -------------------------------------------------------------------------
  // Step 4: Summary
  // -------------------------------------------------------------------------

  const summary = {
    windowStart: windowStart.toISOString(),
    windowEnd: now.toISOString(),
    casesProcessed: cases.length,
    upsertSucceeded,
    upsertFailed,
  };

  console.log("[cron-reindex] Summary:", JSON.stringify(summary, null, 2));

  res.writeHead(200, { "Content-Type": "application/json" });
  res.end(JSON.stringify(summary));
}

// Catalyst Cron function contract
module.exports = handler;
