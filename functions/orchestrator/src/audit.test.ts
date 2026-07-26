/**
 * Tests for audit.ts
 *
 * Covers:
 *   - buildAuditRecord: required fields, PII flag logic, retention date
 *   - writeAuditRecord: writes to executor, handles write failures gracefully
 *
 * Requirements: 5.1, 5.2, 5.4
 */

import { describe, it, expect, vi } from "vitest";
import { buildAuditRecord, writeAuditRecord } from "./audit";
import type { ReasoningTrace } from "./types";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeTrace(overrides: Partial<ReasoningTrace> = {}): ReasoningTrace {
  return {
    query_parsed: null,
    agents_invoked: ["router", "structured_query"],
    zcql_filters: [],
    jaccard_scores: [],
    zia_entities: [],
    ...overrides,
  };
}

const BASE_TIMESTAMP = "2024-06-15T12:00:00.000Z";

function baseParams(overrides: Partial<Parameters<typeof buildAuditRecord>[0]> = {}) {
  return {
    queried_by: "user-001",
    query_text: "Show burglary cases in Bengaluru",
    agents_invoked: ["router", "structured_query", "explainability"],
    tables_accessed: ["Cases"],
    reasoning_trace: makeTrace(),
    timestamp: BASE_TIMESTAMP,
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// buildAuditRecord — required fields (Requirement 5.1)
// ---------------------------------------------------------------------------

describe("buildAuditRecord — required fields present (Req 5.1)", () => {
  it("returns a record with all required fields non-null", () => {
    const record = buildAuditRecord(baseParams());

    expect(record.audit_id).toBeTruthy();
    expect(record.queried_by).toBe("user-001");
    expect(record.query_text).toBe("Show burglary cases in Bengaluru");
    expect(record.agents_invoked).toEqual(["router", "structured_query", "explainability"]);
    expect(record.tables_accessed).toEqual(["Cases"]);
    expect(record.timestamp).toBe(BASE_TIMESTAMP);
  });

  it("audit_id is a UUID-shaped string", () => {
    const record = buildAuditRecord(baseParams());
    // UUID v4 format: 8-4-4-4-12 hex chars separated by hyphens
    expect(record.audit_id).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
    );
  });

  it("two consecutive calls produce different audit_ids", () => {
    const a = buildAuditRecord(baseParams());
    const b = buildAuditRecord(baseParams());
    expect(a.audit_id).not.toBe(b.audit_id);
  });

  it("reasoning_trace_json is a JSON-serialised ReasoningTrace", () => {
    const trace = makeTrace({ zcql_filters: ["crime type: burglary"] });
    const record = buildAuditRecord(baseParams({ reasoning_trace: trace }));
    const parsed = JSON.parse(record.reasoning_trace_json) as ReasoningTrace;
    expect(parsed.zcql_filters).toContain("crime type: burglary");
  });

  it("defaults timestamp to current time when not supplied", () => {
    const before = Date.now();
    const record = buildAuditRecord({
      queried_by: "u",
      query_text: "q",
      agents_invoked: [],
      tables_accessed: [],
      reasoning_trace: makeTrace(),
    });
    const after = Date.now();
    const ts = new Date(record.timestamp).getTime();
    expect(ts).toBeGreaterThanOrEqual(before);
    expect(ts).toBeLessThanOrEqual(after);
  });
});

// ---------------------------------------------------------------------------
// buildAuditRecord — PII flag (Requirement 5.2)
// ---------------------------------------------------------------------------

describe("buildAuditRecord — pii_access flag (Req 5.2)", () => {
  it("pii_access is false when no PII tables accessed", () => {
    const record = buildAuditRecord(baseParams({ tables_accessed: ["Cases", "MO_Features"] }));
    expect(record.pii_access).toBe(false);
  });

  it("pii_access is true when Suspects is in tables_accessed", () => {
    const record = buildAuditRecord(
      baseParams({ tables_accessed: ["Cases", "Suspects"] })
    );
    expect(record.pii_access).toBe(true);
  });

  it("pii_access is true when Victims is in tables_accessed", () => {
    const record = buildAuditRecord(
      baseParams({ tables_accessed: ["Cases", "Victims"] })
    );
    expect(record.pii_access).toBe(true);
  });

  it("pii_access is true when both Suspects and Victims are present", () => {
    const record = buildAuditRecord(
      baseParams({ tables_accessed: ["Cases", "Suspects", "Victims"] })
    );
    expect(record.pii_access).toBe(true);
  });

  it("pii_access check is case-sensitive — lowercase 'suspects' does NOT set flag", () => {
    const record = buildAuditRecord(
      baseParams({ tables_accessed: ["suspects", "victims"] })
    );
    expect(record.pii_access).toBe(false);
  });

  it("pii_access is false for an empty tables_accessed list", () => {
    const record = buildAuditRecord(baseParams({ tables_accessed: [] }));
    expect(record.pii_access).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// buildAuditRecord — retention date (Requirement 5.4)
// ---------------------------------------------------------------------------

describe("buildAuditRecord — retention_expires_at (Req 5.4)", () => {
  it("retention_expires_at is exactly 90 days after timestamp", () => {
    const record = buildAuditRecord(baseParams());
    const ts = new Date(record.timestamp).getTime();
    const ret = new Date(record.retention_expires_at).getTime();
    const diffDays = (ret - ts) / (1000 * 60 * 60 * 24);
    expect(diffDays).toBe(90);
  });

  it("retention date advances with the supplied timestamp", () => {
    const ts1 = "2024-01-01T00:00:00.000Z";
    const ts2 = "2024-07-01T00:00:00.000Z";

    const r1 = buildAuditRecord(baseParams({ timestamp: ts1 }));
    const r2 = buildAuditRecord(baseParams({ timestamp: ts2 }));

    const exp1 = new Date(r1.retention_expires_at).getTime();
    const exp2 = new Date(r2.retention_expires_at).getTime();
    const src1 = new Date(ts1).getTime();
    const src2 = new Date(ts2).getTime();

    expect(exp1 - src1).toBe(90 * 24 * 60 * 60 * 1000);
    expect(exp2 - src2).toBe(90 * 24 * 60 * 60 * 1000);
  });

  it("retention_expires_at is a valid ISO 8601 string", () => {
    const record = buildAuditRecord(baseParams());
    expect(() => new Date(record.retention_expires_at)).not.toThrow();
    // toISOString() always ends with 'Z'
    expect(record.retention_expires_at).toMatch(/Z$/);
  });
});

// ---------------------------------------------------------------------------
// writeAuditRecord — writes to executor
// ---------------------------------------------------------------------------

describe("writeAuditRecord — writes record via executor", () => {
  it("calls the executor once with the record row data", async () => {
    const executor = vi.fn().mockResolvedValue(undefined);
    const record = buildAuditRecord(baseParams());

    await writeAuditRecord(record, null, executor);

    expect(executor).toHaveBeenCalledTimes(1);
    // Second argument is the row data
    const [, row] = executor.mock.calls[0] as [string, Record<string, unknown>];
    expect(row.audit_id).toBe(record.audit_id);
    expect(row.queried_by).toBe(record.queried_by);
    expect(row.query_text).toBe(record.query_text);
    expect(row.pii_access).toBe(record.pii_access);
    expect(row.timestamp).toBe(record.timestamp);
    expect(row.retention_expires_at).toBe(record.retention_expires_at);
  });

  it("agents_invoked is stored as a JSON string", async () => {
    const executor = vi.fn().mockResolvedValue(undefined);
    const record = buildAuditRecord(
      baseParams({ agents_invoked: ["router", "case_linking"] })
    );

    await writeAuditRecord(record, null, executor);

    const [, row] = executor.mock.calls[0] as [string, Record<string, unknown>];
    const parsed = JSON.parse(row.agents_invoked as string) as string[];
    expect(parsed).toEqual(["router", "case_linking"]);
  });

  it("tables_accessed is stored as a JSON string", async () => {
    const executor = vi.fn().mockResolvedValue(undefined);
    const record = buildAuditRecord(
      baseParams({ tables_accessed: ["Cases", "Suspects"] })
    );

    await writeAuditRecord(record, null, executor);

    const [, row] = executor.mock.calls[0] as [string, Record<string, unknown>];
    const parsed = JSON.parse(row.tables_accessed as string) as string[];
    expect(parsed).toContain("Cases");
    expect(parsed).toContain("Suspects");
  });
});

// ---------------------------------------------------------------------------
// writeAuditRecord — graceful failure (error-handling spec)
// ---------------------------------------------------------------------------

describe("writeAuditRecord — handles write failure gracefully", () => {
  it("does not throw when executor rejects", async () => {
    const failingExecutor = vi.fn().mockRejectedValue(new Error("Data Store unavailable"));
    const record = buildAuditRecord(baseParams());

    // Must not throw — audit failure cannot break the query response
    await expect(writeAuditRecord(record, null, failingExecutor)).resolves.toBeUndefined();
  });

  it("logs the error to console.error when executor fails", async () => {
    const consoleSpy = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const failingExecutor = vi.fn().mockRejectedValue(new Error("timeout"));
    const record = buildAuditRecord(baseParams());

    await writeAuditRecord(record, null, failingExecutor);

    expect(consoleSpy).toHaveBeenCalledWith(
      expect.stringContaining("[AuditLogger]"),
      expect.any(Error)
    );

    consoleSpy.mockRestore();
  });
});
