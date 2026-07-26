/**
 * Audit Logger
 *
 * Writes one AuditRecord per completed query to the Audit_Log Catalyst Data
 * Store table.
 *
 * Key rules (Requirements 5.1, 5.2, 5.4):
 *   - pii_access = true iff tables_accessed contains "Suspects" or "Victims"
 *     (case-sensitive)
 *   - retention_expires_at = timestamp + exactly 90 days
 *   - Write failures are logged but never thrown — audit failure must not
 *     break the query response
 */

import { v4 as uuidv4 } from "uuid";
import type { AuditRecord, ReasoningTrace } from "./types";

// ---------------------------------------------------------------------------
// Public re-export of AuditRecord for consumers that import from this module
// ---------------------------------------------------------------------------
export type { AuditRecord };

// ---------------------------------------------------------------------------
// ZCQL executor type — injectable for testing (same pattern as structuredQuery.ts)
// ---------------------------------------------------------------------------

export type ZcqlExecutor = (query: string, params?: Record<string, unknown>) => Promise<void>;

// ---------------------------------------------------------------------------
// PII table names (case-sensitive per Requirement 5.2)
// ---------------------------------------------------------------------------

const PII_TABLES = new Set<string>(["Suspects", "Victims"]);

// ---------------------------------------------------------------------------
// buildAuditRecord
// ---------------------------------------------------------------------------

export interface BuildAuditRecordParams {
  /** Catalyst Auth user ID of the investigator who ran the query. */
  queried_by: string;
  /** Raw natural-language query text. */
  query_text: string;
  /** Names of agents invoked during the query cycle. */
  agents_invoked: string[];
  /** Names of Data Store tables touched during the query cycle. */
  tables_accessed: string[];
  /** The fully-assembled ReasoningTrace to persist alongside the record. */
  reasoning_trace: ReasoningTrace;
  /**
   * ISO 8601 timestamp for the query.  Defaults to now if not supplied.
   * Supplying an explicit value makes the function deterministic for tests.
   */
  timestamp?: string;
}

/**
 * Build an AuditRecord from the completed query context.
 *
 * Requirements:
 *   5.1 — Record must include queried_by, query_text, agents_invoked,
 *          tables_accessed, timestamp (all non-null)
 *   5.2 — pii_access flag is true iff "Suspects" or "Victims" appear in
 *          tables_accessed (case-sensitive)
 *   5.4 — retention_expires_at = timestamp + 90 days
 */
export function buildAuditRecord(params: BuildAuditRecordParams): AuditRecord {
  const {
    queried_by,
    query_text,
    agents_invoked,
    tables_accessed,
    reasoning_trace,
    timestamp,
  } = params;

  // Use supplied timestamp or ISO string for current time
  const ts = timestamp ?? new Date().toISOString();

  // Requirement 5.2: PII flag — case-sensitive membership check
  const pii_access = tables_accessed.some((t) => PII_TABLES.has(t));

  // Requirement 5.4: retention = timestamp + 90 days
  const tsDate = new Date(ts);
  const retentionDate = new Date(tsDate);
  retentionDate.setUTCDate(retentionDate.getUTCDate() + 90);
  const retention_expires_at = retentionDate.toISOString();

  return {
    audit_id: uuidv4(),
    queried_by,
    query_text,
    agents_invoked,
    tables_accessed,
    pii_access,
    timestamp: ts,
    reasoning_trace_json: JSON.stringify(reasoning_trace),
    retention_expires_at,
  };
}

// ---------------------------------------------------------------------------
// Real Catalyst SDK executor factory
// ---------------------------------------------------------------------------

/**
 * Build a real ZCQL executor from the Catalyst app instance.
 * Inserts the AuditRecord row into the Audit_Log table.
 */
function buildRealExecutor(app: unknown): ZcqlExecutor {
  if (!app || typeof (app as Record<string, unknown>).datastore !== "function") {
    return async () => {};
  }
  return async (_query: string, params?: Record<string, unknown>): Promise<void> => {
    // Catalyst SDK: app.datastore().table("Audit_Log").insertRow(...)
    const sdk = app as {
      datastore: () => {
        table: (name: string) => {
          insertRow: (row: Record<string, unknown>) => Promise<unknown>;
        };
      };
    };
    await sdk.datastore().table("Audit_Log").insertRow(params ?? {});
  };
}

// ---------------------------------------------------------------------------
// writeAuditRecord
// ---------------------------------------------------------------------------

/**
 * Persist an AuditRecord to the Audit_Log Catalyst Data Store table.
 *
 * @param record    The fully-built AuditRecord to write.
 * @param app       Catalyst app instance (used for real Data Store access).
 * @param executor  Optional ZCQL executor override — inject a mock for tests.
 *
 * Write failures are caught and logged; they are never re-thrown so that
 * an audit failure cannot break the investigator-facing query response.
 *
 * Requirements: 5.1, 5.2, 5.4
 */
export async function writeAuditRecord(
  record: AuditRecord,
  app: unknown,
  executor?: ZcqlExecutor
): Promise<void> {
  const exec: ZcqlExecutor = executor ?? buildRealExecutor(app);

  // Map AuditRecord fields to Audit_Log column names (design doc schema)
  const row: Record<string, unknown> = {
    audit_id: record.audit_id,
    queried_by: record.queried_by,
    query_text: record.query_text,
    agents_invoked: JSON.stringify(record.agents_invoked),
    tables_accessed: JSON.stringify(record.tables_accessed),
    pii_access: record.pii_access,
    timestamp: record.timestamp,
    reasoning_trace_json: record.reasoning_trace_json,
    retention_expires_at: record.retention_expires_at,
  };

  // The query string is unused for the table-insert API path; pass the row
  // as params so both real and mock executors receive the data.
  try {
    await exec("INSERT INTO Audit_Log", row);
  } catch (err: unknown) {
    // Requirement 5.1 / error-handling spec: log but never throw
    console.error("[AuditLogger] Failed to write audit record:", err);
  }
}
