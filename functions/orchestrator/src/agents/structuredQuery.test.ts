/**
 * Unit tests for Structured Query Agent
 * Requirements: 2.3, 2.4, 2.5
 */

import { describe, it, expect, vi } from "vitest";
import { runStructuredQueryAgent, escapeZcqlString } from "./structuredQuery";
import type { ParsedIntent, ExtractedEntities } from "../types";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeEntities(overrides: Partial<ExtractedEntities> = {}): ExtractedEntities {
  return {
    locations: [],
    crime_types: [],
    suspect_names: [],
    case_ids: [],
    mo_features: {},
    ...overrides,
  };
}

const ZCQL_KEYWORDS = [
  "SELECT",
  "FROM",
  "WHERE",
  "ORDER BY",
  "LIMIT",
  " AND ",
  " OR ",
  " LIKE ",
  "JOIN",
  "IN (",
  "ROWID",
];

// ---------------------------------------------------------------------------
// 6.4 — Zero-results edge case (Requirement 2.3)
// ---------------------------------------------------------------------------

describe("StructuredQueryAgent — zero-results edge case (Req 2.3)", () => {
  it("returns zero_results=true and a guidance_message when the executor returns empty rows", async () => {
    const emptyExecutor = vi.fn().mockResolvedValue([]);

    const intent: ParsedIntent = {
      type: "case_lookup",
      needs_clarification: false,
    };
    const entities = makeEntities({ crime_types: ["robbery"], locations: ["Bengaluru"] });

    const result = await runStructuredQueryAgent(intent, entities, null, emptyExecutor);

    expect(result.zero_results).toBe(true);
    expect(result.guidance_message).toBeDefined();
    expect(result.guidance_message).toContain("No matching records");
    expect(result.results).toHaveLength(1);
    expect(result.results[0].row_count).toBe(0);
  });

  it("includes the human-readable filters in the guidance message", async () => {
    const emptyExecutor = vi.fn().mockResolvedValue([]);

    const intent: ParsedIntent = { type: "case_lookup", needs_clarification: false };
    const entities = makeEntities({ crime_types: ["burglary"], locations: ["Mysuru"] });

    const result = await runStructuredQueryAgent(intent, entities, null, emptyExecutor);

    expect(result.guidance_message).toContain("burglary");
  });

  it("returns zero_results=true for pattern_search with no rows", async () => {
    const emptyExecutor = vi.fn().mockResolvedValue([]);

    const intent: ParsedIntent = { type: "pattern_search", needs_clarification: false };
    const entities = makeEntities({ mo_features: { entry_method: "forced_door", time_of_day: "night" } });

    const result = await runStructuredQueryAgent(intent, entities, null, emptyExecutor);

    expect(result.zero_results).toBe(true);
    expect(result.guidance_message).toBeDefined();
  });

  it("returns zero_results=true for network_query with no rows", async () => {
    const emptyExecutor = vi.fn().mockResolvedValue([]);

    const intent: ParsedIntent = { type: "network_query", needs_clarification: false };
    const entities = makeEntities({ suspect_names: ["John Doe"] });

    const result = await runStructuredQueryAgent(intent, entities, null, emptyExecutor);

    expect(result.zero_results).toBe(true);
  });

  it("returns zero_results=false when rows are present", async () => {
    const rowExecutor = vi.fn().mockResolvedValue([
      { case_id: "KSP-2024-001", title: "Test Case", status: "open" },
    ]);

    const intent: ParsedIntent = { type: "case_lookup", needs_clarification: false };
    const entities = makeEntities({ crime_types: ["theft"] });

    const result = await runStructuredQueryAgent(intent, entities, null, rowExecutor);

    expect(result.zero_results).toBe(false);
    expect(result.error).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// 6.4 — Data Store error edge case (Requirement 2.4)
// ---------------------------------------------------------------------------

describe("StructuredQueryAgent — Data Store error edge case (Req 2.4)", () => {
  it("returns error message and empty results when executor throws", async () => {
    const failingExecutor = vi.fn().mockRejectedValue(new Error("ZCQL execution failed"));

    const intent: ParsedIntent = { type: "case_lookup", needs_clarification: false };
    const entities = makeEntities({ crime_types: ["robbery"] });

    const result = await runStructuredQueryAgent(intent, entities, null, failingExecutor);

    expect(result.error).toBeDefined();
    expect(result.error).not.toContain("ZCQL");
    expect(result.error).not.toContain("execution failed");
    expect(result.results).toHaveLength(0);
  });

  it("user-facing error message does not expose internal details", async () => {
    const failingExecutor = vi.fn().mockRejectedValue(
      new Error("SELECT * FROM Cases WHERE — syntax error near WHERE")
    );

    const intent: ParsedIntent = { type: "pattern_search", needs_clarification: false };
    const entities = makeEntities({ mo_features: { weapon_type: "knife" } });

    const result = await runStructuredQueryAgent(intent, entities, null, failingExecutor);

    expect(result.error).toBeDefined();
    // Must not expose raw ZCQL in error message
    for (const kw of ZCQL_KEYWORDS) {
      expect(result.error).not.toContain(kw);
    }
  });

  it("network_query executor failure returns user-friendly error", async () => {
    const failingExecutor = vi.fn().mockRejectedValue(new Error("connection timeout"));

    const intent: ParsedIntent = { type: "network_query", needs_clarification: false };
    const entities = makeEntities({ suspect_names: ["Jane Smith"] });

    const result = await runStructuredQueryAgent(intent, entities, null, failingExecutor);

    expect(result.error).toBeDefined();
    expect(result.zero_results).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// filters_applied — no raw ZCQL in human-readable output (Requirement 2.5)
// ---------------------------------------------------------------------------

describe("StructuredQueryAgent — filters_applied contains no raw ZCQL (Req 2.5)", () => {
  it("case_lookup filters_applied has no ZCQL keywords", async () => {
    const rowExecutor = vi.fn().mockResolvedValue([
      { case_id: "KSP-2024-002", title: "Test", status: "open" },
    ]);

    const intent: ParsedIntent = { type: "case_lookup", needs_clarification: false };
    const entities = makeEntities({
      crime_types: ["burglary"],
      locations: ["Bengaluru"],
      date_range: { from: "2024-01-01", to: "2024-01-31" },
    });

    const result = await runStructuredQueryAgent(intent, entities, null, rowExecutor);

    const filtersText = result.results.flatMap((r) => r.filters_applied).join(" ");
    for (const kw of ZCQL_KEYWORDS) {
      expect(filtersText).not.toContain(kw);
    }
  });

  it("pattern_search filters_applied has no ZCQL keywords", async () => {
    const rowExecutor = vi.fn().mockResolvedValue([
      { case_id: "KSP-2024-003", title: "Pattern", status: "open" },
    ]);

    const intent: ParsedIntent = { type: "pattern_search", needs_clarification: false };
    const entities = makeEntities({
      mo_features: {
        entry_method: "window",
        time_of_day: "night",
        weapon_type: "knife",
        target_type: "residential",
      },
    });

    const result = await runStructuredQueryAgent(intent, entities, null, rowExecutor);

    const filtersText = result.results.flatMap((r) => r.filters_applied).join(" ");
    for (const kw of ZCQL_KEYWORDS) {
      expect(filtersText).not.toContain(kw);
    }
  });
});

// ---------------------------------------------------------------------------
// unknown intent
// ---------------------------------------------------------------------------

describe("StructuredQueryAgent — unknown intent", () => {
  it("returns zero_results=true and guidance_message for unknown intent", async () => {
    const executor = vi.fn();

    const intent: ParsedIntent = { type: "unknown", needs_clarification: false };
    const entities = makeEntities();

    const result = await runStructuredQueryAgent(intent, entities, null, executor);

    expect(result.zero_results).toBe(true);
    expect(result.guidance_message).toBeDefined();
    expect(executor).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// combined intent — fans out to all three query types
// ---------------------------------------------------------------------------

describe("StructuredQueryAgent — combined intent", () => {
  it("returns results from all three tables for combined intent", async () => {
    const rowExecutor = vi.fn().mockResolvedValue([
      { case_id: "KSP-2024-004", title: "Combined", status: "closed" },
    ]);

    const intent: ParsedIntent = { type: "combined", needs_clarification: false };
    const entities = makeEntities({ crime_types: ["robbery"], suspect_names: ["Bob"] });

    const result = await runStructuredQueryAgent(intent, entities, null, rowExecutor);

    expect(result.zero_results).toBe(false);
    expect(result.results).toHaveLength(3);
    const tables = result.results.map((r) => r.table);
    expect(tables).toContain("Cases");
    expect(tables).toContain("MO_Features");
    expect(tables).toContain("Suspects");
  });
});

// ---------------------------------------------------------------------------
// escapeZcqlString helper
// ---------------------------------------------------------------------------

describe("escapeZcqlString", () => {
  it("wraps value in single quotes", () => {
    expect(escapeZcqlString("robbery")).toBe("'robbery'");
  });

  it("escapes internal single quotes by doubling", () => {
    expect(escapeZcqlString("O'Brien")).toBe("'O''Brien'");
  });

  it("handles empty string", () => {
    expect(escapeZcqlString("")).toBe("''");
  });
});
