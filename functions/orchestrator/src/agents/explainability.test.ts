/**
 * Unit tests for the Explainability Layer
 *
 * Task 11.9: error injected mid-chain → trace contains failed_step and partial_results
 *            linked_cases answer path → "Potential pattern matches for investigator review"
 *            network_results answer path → entity count mentioned
 *
 * Requirements: 4.1, 4.3, 4.5
 */

import { describe, it, expect } from "vitest";
import { runExplainabilityNode } from "./explainability";
import type {
  AgentState,
  AgentError,
  LinkedCase,
  NetworkResult,
  NetworkEntity,
  NetworkEdge,
  ReasoningTrace,
} from "../types";
import { emptyReasoningTrace } from "../types";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function baseState(overrides: Partial<AgentState> = {}): AgentState {
  return {
    query_text: "test query",
    session: { user_id: "user-001", token: "tok" },
    parsed_intent: { type: "case_lookup", needs_clarification: false },
    entities: {
      locations: [],
      crime_types: [],
      suspect_names: [],
      case_ids: [],
      mo_features: {},
    },
    structured_results: null,
    linked_cases: null,
    network_results: null,
    reasoning_trace: {
      ...emptyReasoningTrace(),
      agents_invoked: ["router"],
    },
    error: null,
    needs_clarification: false,
    clarification_question: null,
    ...overrides,
  };
}

function makeLinkedCase(
  caseId: string,
  score: number,
  features: string[]
): LinkedCase {
  return {
    case_id: caseId,
    jaccard_score: score,
    matching_features: features,
    zia_entity_overlap: [],
  };
}

function makeNetworkResult(entityCount: number, paginated = false): NetworkResult {
  const entities: NetworkEntity[] = Array.from({ length: entityCount }, (_, i) => ({
    id: `e-${i}`,
    type: "case" as const,
    label: `Case ${i}`,
    hop_distance: i === 0 ? 0 : 1,
  }));
  const edges: NetworkEdge[] = [];
  return {
    entities,
    edges,
    paginated,
    total_count: paginated ? 150 : entityCount,
  };
}

// ---------------------------------------------------------------------------
// Requirement 4.1 — ReasoningTrace always has all required fields
// ---------------------------------------------------------------------------

describe("runExplainabilityNode — ReasoningTrace completeness (Req 4.1, 4.3)", () => {
  it("returns a trace with all required top-level fields present", () => {
    const { reasoning_trace } = runExplainabilityNode(baseState());

    expect(reasoning_trace).toHaveProperty("query_parsed");
    expect(reasoning_trace).toHaveProperty("agents_invoked");
    expect(reasoning_trace).toHaveProperty("zcql_filters");
    expect(reasoning_trace).toHaveProperty("jaccard_scores");
    expect(reasoning_trace).toHaveProperty("zia_entities");
  });

  it("zcql_filters, jaccard_scores, zia_entities are arrays even when not populated", () => {
    const { reasoning_trace } = runExplainabilityNode(baseState());

    expect(Array.isArray(reasoning_trace.zcql_filters)).toBe(true);
    expect(Array.isArray(reasoning_trace.jaccard_scores)).toBe(true);
    expect(Array.isArray(reasoning_trace.zia_entities)).toBe(true);
  });

  it("agents_invoked is a non-empty array containing previously accumulated nodes", () => {
    const state = baseState();
    state.reasoning_trace.agents_invoked = ["router", "structured_query"];

    const { reasoning_trace } = runExplainabilityNode(state);

    expect(reasoning_trace.agents_invoked.length).toBeGreaterThan(0);
    expect(reasoning_trace.agents_invoked).toContain("router");
    expect(reasoning_trace.agents_invoked).toContain("structured_query");
  });

  it("query_parsed merges parsed_intent and entities when both are present", () => {
    const state = baseState({
      parsed_intent: { type: "pattern_search", needs_clarification: false },
      entities: {
        locations: ["Bengaluru"],
        crime_types: ["robbery"],
        suspect_names: [],
        case_ids: [],
        mo_features: { time_of_day: "night" },
      },
    });

    const { reasoning_trace } = runExplainabilityNode(state);

    expect(reasoning_trace.query_parsed).not.toBeNull();
    expect(reasoning_trace.query_parsed).toMatchObject({
      type: "pattern_search",
      locations: ["Bengaluru"],
      crime_types: ["robbery"],
    });
  });

  it("zcql_filters are de-duplicated across multiple QueryResult objects", () => {
    const state = baseState({
      structured_results: [
        {
          table: "Cases",
          rows: [{ case_id: "KSP-001" }],
          filters_applied: ["crime type: robbery", "location: Bengaluru"],
          row_count: 1,
        },
        {
          table: "Suspects",
          rows: [],
          filters_applied: ["crime type: robbery"],
          row_count: 0,
        },
      ],
    });

    const { reasoning_trace } = runExplainabilityNode(state);

    // "crime type: robbery" appears twice in input but must be deduplicated
    const occurrences = reasoning_trace.zcql_filters.filter((f) => f === "crime type: robbery");
    expect(occurrences).toHaveLength(1);
  });

  it("jaccard_scores populated from linked_cases when present", () => {
    const state = baseState({
      linked_cases: [
        makeLinkedCase("KSP-001", 0.8, ["entry_method:forced_door", "time_of_day:night"]),
        makeLinkedCase("KSP-002", 0.65, ["weapon_type:knife"]),
      ],
    });

    const { reasoning_trace } = runExplainabilityNode(state);

    expect(reasoning_trace.jaccard_scores).toHaveLength(2);
    expect(reasoning_trace.jaccard_scores[0]).toEqual({
      case_id: "KSP-001",
      score: 0.8,
      matching_features: ["entry_method:forced_door", "time_of_day:night"],
    });
  });

  it("traversal_path is populated from network_results edges when present", () => {
    const edges: NetworkEdge[] = [
      { from_id: "e-0", to_id: "e-1", relationship: "involves" },
    ];
    const networkResult: NetworkResult = {
      entities: [{ id: "e-0", type: "case", label: "C0", hop_distance: 0 }],
      edges,
      paginated: false,
      total_count: 1,
    };
    const state = baseState({ network_results: networkResult });

    const { reasoning_trace } = runExplainabilityNode(state);

    expect(reasoning_trace.traversal_path).toEqual(edges);
  });
});

// ---------------------------------------------------------------------------
// Requirement 4.5 — Error path: failed_step and partial_results
// ---------------------------------------------------------------------------

describe("runExplainabilityNode — error path (Req 4.5)", () => {
  it("sets failed_step to the erroring agent name", () => {
    const partialTrace: ReasoningTrace = {
      ...emptyReasoningTrace(),
      agents_invoked: ["router"],
    };
    const error: AgentError = {
      agent: "structured_query",
      code: "ZCQL_ERROR",
      message: "Query construction failed — please try rephrasing.",
      partial_trace: partialTrace,
    };

    const { reasoning_trace } = runExplainabilityNode(baseState({ error }));

    expect(reasoning_trace.failed_step).toBe("structured_query");
  });

  it("sets partial_results to the error's partial_trace", () => {
    const partialTrace: ReasoningTrace = {
      ...emptyReasoningTrace(),
      agents_invoked: ["router"],
      zcql_filters: ["crime type: robbery"],
    };
    const error: AgentError = {
      agent: "case_linking",
      code: "ZIA_ERROR",
      message: "Zia enrichment failed.",
      partial_trace: partialTrace,
    };

    const { reasoning_trace } = runExplainabilityNode(baseState({ error }));

    expect(reasoning_trace.partial_results).toEqual(partialTrace);
  });

  it("answer text is the error's message", () => {
    const error: AgentError = {
      agent: "router",
      code: "LLM_ERROR",
      message: "Query construction failed — please try rephrasing.",
      partial_trace: emptyReasoningTrace(),
    };

    const { answer } = runExplainabilityNode(baseState({ error }));

    expect(answer).toBe("Query construction failed — please try rephrasing.");
  });

  it("failed_step and partial_results are absent when there is no error", () => {
    const { reasoning_trace } = runExplainabilityNode(baseState());

    expect(reasoning_trace.failed_step).toBeUndefined();
    expect(reasoning_trace.partial_results).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// linked_cases answer path
// ---------------------------------------------------------------------------

describe("runExplainabilityNode — linked_cases answer path", () => {
  it('answer starts with "Potential pattern matches for investigator review"', () => {
    const state = baseState({
      linked_cases: [
        makeLinkedCase("KSP-2024-010", 0.8, ["entry_method:forced_door", "time_of_day:night"]),
        makeLinkedCase("KSP-2024-015", 0.65, ["weapon_type:knife"]),
      ],
    });

    const { answer } = runExplainabilityNode(state);

    expect(answer).toMatch(/Potential pattern matches for investigator review/i);
  });

  it("answer includes each case_id", () => {
    const state = baseState({
      linked_cases: [
        makeLinkedCase("KSP-2024-010", 0.8, ["entry_method:forced_door"]),
        makeLinkedCase("KSP-2024-015", 0.65, ["weapon_type:knife"]),
      ],
    });

    const { answer } = runExplainabilityNode(state);

    expect(answer).toContain("KSP-2024-010");
    expect(answer).toContain("KSP-2024-015");
  });

  it("answer includes jaccard scores formatted to 2 decimal places", () => {
    const state = baseState({
      linked_cases: [
        makeLinkedCase("KSP-2024-010", 0.8, ["entry_method:forced_door"]),
      ],
    });

    const { answer } = runExplainabilityNode(state);

    expect(answer).toContain("0.80");
  });

  it("answer includes matching features for each case", () => {
    const state = baseState({
      linked_cases: [
        makeLinkedCase("KSP-2024-010", 0.8, ["entry_method:forced_door", "time_of_day:night"]),
      ],
    });

    const { answer } = runExplainabilityNode(state);

    expect(answer).toContain("entry_method:forced_door");
    expect(answer).toContain("time_of_day:night");
  });

  it("answer shows correct case count — singular", () => {
    const state = baseState({
      linked_cases: [makeLinkedCase("KSP-001", 0.75, ["weapon_type:knife"])],
    });

    const { answer } = runExplainabilityNode(state);

    expect(answer).toContain("1 case)");
  });

  it("answer shows correct case count — plural", () => {
    const state = baseState({
      linked_cases: [
        makeLinkedCase("KSP-001", 0.75, ["weapon_type:knife"]),
        makeLinkedCase("KSP-002", 0.70, ["time_of_day:night"]),
        makeLinkedCase("KSP-003", 0.60, ["target_type:residential"]),
      ],
    });

    const { answer } = runExplainabilityNode(state);

    expect(answer).toContain("3 cases)");
  });

  it("falls through to structured_results path when linked_cases is empty array", () => {
    const state = baseState({
      linked_cases: [],
      structured_results: [
        {
          table: "Cases",
          rows: [{ case_id: "KSP-001", title: "Test", status: "open" }],
          filters_applied: ["crime type: robbery"],
          row_count: 1,
        },
      ],
    });

    const { answer } = runExplainabilityNode(state);

    // Should NOT use linked_cases path (empty array), should use structured_results
    expect(answer).not.toMatch(/Potential pattern matches/i);
    expect(answer).toContain("1 matching case");
  });
});

// ---------------------------------------------------------------------------
// network_results answer path
// ---------------------------------------------------------------------------

describe("runExplainabilityNode — network_results answer path", () => {
  it("answer mentions entity count when network results are present", () => {
    const state = baseState({
      network_results: makeNetworkResult(5),
    });

    const { answer } = runExplainabilityNode(state);

    expect(answer).toContain("5");
  });

  it("answer uses singular 'entity' when there is exactly one", () => {
    const state = baseState({
      network_results: makeNetworkResult(1),
    });

    const { answer } = runExplainabilityNode(state);

    expect(answer).toContain("1 connected entity");
  });

  it("answer uses plural 'entities' when there are multiple", () => {
    const state = baseState({
      network_results: makeNetworkResult(3),
    });

    const { answer } = runExplainabilityNode(state);

    expect(answer).toContain("entities");
  });

  it("answer mentions pagination and total count when paginated is true", () => {
    const state = baseState({
      network_results: makeNetworkResult(100, true),
    });

    const { answer } = runExplainabilityNode(state);

    expect(answer).toContain("150");
    expect(answer).toContain("100");
    expect(answer).toMatch(/refine/i);
  });

  it("falls through to next path when network_results has no entities", () => {
    const state = baseState({
      network_results: {
        entities: [],
        edges: [],
        paginated: false,
        total_count: 0,
      },
      structured_results: [
        {
          table: "Cases",
          rows: [],
          filters_applied: ["suspect: unknown"],
          row_count: 0,
        },
      ],
    });

    const { answer } = runExplainabilityNode(state);

    // Should use structured_results / zero-results path, not network path
    expect(answer).toContain("No matching records");
  });
});

// ---------------------------------------------------------------------------
// Clarification and unknown-intent answer paths
// ---------------------------------------------------------------------------

describe("runExplainabilityNode — clarification and unknown-intent paths", () => {
  it("returns the clarification_question when needs_clarification is true", () => {
    const state = baseState({
      needs_clarification: true,
      clarification_question: "Could you specify the district?",
      parsed_intent: { type: "case_lookup", needs_clarification: true, clarification_question: "Could you specify the district?" },
    });

    const { answer } = runExplainabilityNode(state);

    expect(answer).toBe("Could you specify the district?");
  });

  it("returns fallback clarification text when clarification_question is null", () => {
    const state = baseState({
      needs_clarification: true,
      clarification_question: null,
    });

    const { answer } = runExplainabilityNode(state);

    expect(answer).toBe("Could you provide more details?");
  });

  it("returns guidance listing supported query types for unknown intent", () => {
    const state = baseState({
      parsed_intent: { type: "unknown", needs_clarification: false },
    });

    const { answer } = runExplainabilityNode(state);

    expect(answer).toMatch(/Case lookup/i);
    expect(answer).toMatch(/Pattern search/i);
    expect(answer).toMatch(/Network query/i);
  });
});

// ---------------------------------------------------------------------------
// structured_results answer path
// ---------------------------------------------------------------------------

describe("runExplainabilityNode — structured_results answer path", () => {
  it("returns no-results guidance with filters when all rows are empty", () => {
    const state = baseState({
      structured_results: [
        {
          table: "Cases",
          rows: [],
          filters_applied: ["crime type: cyber fraud", "location: Coorg"],
          row_count: 0,
        },
      ],
    });

    const { answer } = runExplainabilityNode(state);

    expect(answer).toContain("No matching records");
    expect(answer).toContain("cyber fraud");
    expect(answer).toContain("Coorg");
  });

  it("returns found-N-matching-cases answer when rows are present", () => {
    const state = baseState({
      structured_results: [
        {
          table: "Cases",
          rows: [
            { case_id: "KSP-001", title: "Test", status: "open" },
            { case_id: "KSP-002", title: "Test2", status: "closed" },
          ],
          filters_applied: ["crime type: robbery"],
          row_count: 2,
        },
      ],
    });

    const { answer } = runExplainabilityNode(state);

    expect(answer).toContain("2 matching cases");
    expect(answer).toMatch(/KSP-001|KSP-002/);
  });

  it("uses singular 'case' when row_count is 1", () => {
    const state = baseState({
      structured_results: [
        {
          table: "Cases",
          rows: [{ case_id: "KSP-001", title: "Only", status: "open" }],
          filters_applied: [],
          row_count: 1,
        },
      ],
    });

    const { answer } = runExplainabilityNode(state);

    expect(answer).toContain("1 matching case");
    expect(answer).not.toContain("1 matching cases");
  });

  it("returns generic success message when all result fields are null", () => {
    const state = baseState({
      structured_results: null,
      linked_cases: null,
      network_results: null,
      parsed_intent: { type: "case_lookup", needs_clarification: false },
    });

    const { answer } = runExplainabilityNode(state);

    expect(answer).toBe("Query processed successfully.");
  });
});
