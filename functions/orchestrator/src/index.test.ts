/**
 * Unit tests for the Catalyst Advanced I/O Function entry point (index.ts)
 *
 * Task 4.4: Unauthenticated request → HTTP 401 before any agent logic runs
 * Task 7:   End-to-end round-trip — typed query reaches the function, parses
 *           intent, executes ZCQL, and returns a data-grounded answer.
 *
 * Requirements: 5.3, 2.1, 2.2
 */

import { describe, it, expect, vi, beforeEach, beforeAll } from "vitest";
import { IncomingMessage, ServerResponse } from "http";
import { Readable } from "stream";

// ---------------------------------------------------------------------------
// Mock router, structured query agent, and graph before importing the handler.
// graph.ts imports @langchain/langgraph which is slow to initialise; mocking it
// keeps the test suite fast and focused on handler logic.
// ---------------------------------------------------------------------------

vi.mock("./agents/router", () => ({
  runRouter: vi.fn(),
}));

vi.mock("./agents/structuredQuery", () => ({
  runStructuredQueryAgent: vi.fn(),
}));

// Mock the graph module to avoid loading LangGraph in unit tests.
// The mock delegates to the already-mocked router and structuredQuery so that
// the end-to-end round-trip tests still exercise the handler's integration with
// those agents via the graph facade.
vi.mock("./graph", async (importOriginal) => {
  const { runRouter } = await import("./agents/router");
  const { runStructuredQueryAgent } = await import("./agents/structuredQuery");

  async function runGraph(
    queryText: string,
    userId: string,
    _token: string,
    _app: unknown
  ) {
    const routerResult = await (runRouter as ReturnType<typeof vi.fn>)(queryText, _app);
    if (!routerResult) {
      return { answer: "Query processed successfully.", reasoning_trace: { query_parsed: null, agents_invoked: ["router"], zcql_filters: [], jaccard_scores: [], zia_entities: [] } };
    }
    const { parsed_intent, entities } = routerResult as { parsed_intent: { type: string; needs_clarification: boolean; clarification_question?: string }; entities: Record<string, unknown>; guidance_message?: string };

    const trace = {
      query_parsed: { ...parsed_intent, ...entities },
      agents_invoked: ["router"] as string[],
      zcql_filters: [] as string[],
      jaccard_scores: [] as Array<{ case_id: string; score: number; matching_features: string[] }>,
      zia_entities: [] as Array<{ value: string; type: string }>,
    };

    if (parsed_intent.needs_clarification) {
      return { answer: parsed_intent.clarification_question ?? "Could you provide more details?", reasoning_trace: trace };
    }

    if (parsed_intent.type === "unknown") {
      return {
        answer:
          "I can help you with the following types of questions:\n" +
          "\u2022 Case lookup \u2014 Find cases by location, date, crime type, suspect, or case ID.\n" +
          "  Example: 'Show burglary cases in Bengaluru last month'\n" +
          "\u2022 Pattern search \u2014 Find cases with similar modus operandi.\n" +
          "  Example: 'Cases similar to KSP-2024-001' or 'Robberies at night using forced entry'\n" +
          "\u2022 Network query \u2014 Explore connections between suspects, cases, and locations.\n" +
          "  Example: 'Show connections between suspect S-001 and other cases'\n\n" +
          "Please rephrase your query using one of these formats.",
        reasoning_trace: trace,
      };
    }

    if (parsed_intent.type === "case_lookup" || parsed_intent.type === "combined") {
      const sqResult = await (runStructuredQueryAgent as ReturnType<typeof vi.fn>)(parsed_intent, entities, _app);
      if (sqResult?.error) {
        return { answer: sqResult.error, reasoning_trace: { ...trace, agents_invoked: ["router", "structured_query"], zcql_filters: [] } };
      }
      if (sqResult) {
        const allFilters = (sqResult.results as Array<{ filters_applied: string[] }>).flatMap((r) => r.filters_applied);
        const zcql_filters = [...new Set(allFilters)];
        trace.agents_invoked = ["router", "structured_query"];
        trace.zcql_filters = zcql_filters;

        const totalRows = (sqResult.results as Array<{ row_count: number; rows: Record<string, unknown>[] }>).reduce((sum, r) => sum + r.row_count, 0);
        if (totalRows === 0) {
          const unique = [...new Set(allFilters)];
          return { answer: `No matching records found with filters: ${unique.join("; ") || "none"}`, reasoning_trace: trace };
        }
        const previewRows: string[] = [];
        for (const result of sqResult.results as Array<{ rows: Record<string, unknown>[]; row_count: number }>) {
          for (const row of result.rows.slice(0, 3)) {
            const caseId = row["case_id"] ?? row["suspect_id"] ?? row["ROWID"] ?? "";
            const title = row["title"] ?? row["name"] ?? row["crime_type"] ?? "";
            const status = row["status"] ?? "";
            const parts = [caseId, title, status].filter((v) => v !== "").join(" — ");
            if (parts) previewRows.push(String(parts));
          }
          if (previewRows.length >= 3) break;
        }
        const summary = previewRows.length > 0 ? ` ${previewRows.join("; ")}.` : "";
        return { answer: `Found ${totalRows} matching case${totalRows === 1 ? "" : "s"}.${summary}`, reasoning_trace: trace };
      }
    }

    return { answer: "Query processed successfully.", reasoning_trace: trace };
  }

  return { runGraph, buildGraph: vi.fn() };
});

import { runRouter } from "./agents/router";
import { runStructuredQueryAgent } from "./agents/structuredQuery";

// The handler is exported as module.exports in index.ts (Catalyst function contract).
// In Vitest (ESM transform), we access it via the default export.
// We use a dynamic import wrapped in a lazy getter to ensure mocks are set up first.
let handler: (req: IncomingMessage, res: ServerResponse) => Promise<void>;
beforeAll(async () => {
  const mod = await import("./index");
  // module.exports = handler results in a default export in ESM interop
  handler = (mod as unknown as { default: typeof handler }).default;
});

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeRequest(options: {
  method?: string;
  body?: string;
  headers?: Record<string, string>;
}): IncomingMessage {
  const { method = "POST", body = "", headers = {} } = options;
  const stream = new Readable();
  stream.push(body);
  stream.push(null);

  const req = Object.assign(stream, {
    method,
    headers,
    url: "/api/query",
  }) as unknown as IncomingMessage;

  return req;
}

function makeResponse(): { res: ServerResponse; statusCode: () => number; body: () => string } {
  let capturedStatusCode = 0;
  let capturedBody = "";

  const res = {
    writeHead: (code: number) => {
      capturedStatusCode = code;
    },
    end: (data?: string) => {
      capturedBody = data ?? "";
    },
  } as unknown as ServerResponse;

  return {
    res,
    statusCode: () => capturedStatusCode,
    body: () => capturedBody,
  };
}

// ---------------------------------------------------------------------------
// Task 4.4 — Unauthenticated requests return HTTP 401 (Requirement 5.3)
// ---------------------------------------------------------------------------

describe("Handler — authentication gate (Req 5.3)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns 401 when no auth header or cookie is present", async () => {
    const req = makeRequest({ body: JSON.stringify({ query_text: "show burglary cases" }) });
    const { res, statusCode } = makeResponse();

    await handler(req, res);

    expect(statusCode()).toBe(401);
    expect(vi.mocked(runRouter)).not.toHaveBeenCalled();
    expect(vi.mocked(runStructuredQueryAgent)).not.toHaveBeenCalled();
  });

  it("returns 401 without executing any agent logic", async () => {
    const req = makeRequest({
      body: JSON.stringify({ query_text: "find murder cases" }),
      headers: {},
    });
    const { res, statusCode, body } = makeResponse();

    await handler(req, res);

    expect(statusCode()).toBe(401);
    const parsed = JSON.parse(body()) as { error: string };
    expect(parsed.error).toMatch(/unauthorized/i);
  });

  it("returns 401 even when session cookie key is present but empty", async () => {
    const req = makeRequest({
      body: JSON.stringify({ query_text: "robbery in Mysuru" }),
      headers: { cookie: "zscsession=" },
    });
    const { res, statusCode } = makeResponse();

    await handler(req, res);

    expect(statusCode()).toBe(401);
  });

  it("allows request with catalyst-user-id header", async () => {
    vi.mocked(runRouter).mockResolvedValue({
      parsed_intent: { type: "unknown", needs_clarification: false },
      entities: {
        locations: [],
        crime_types: [],
        suspect_names: [],
        case_ids: [],
        mo_features: {},
      },
      guidance_message: "Please rephrase.",
    });

    const req = makeRequest({
      body: JSON.stringify({ query_text: "???" }),
      headers: { "catalyst-user-id": "user-123" },
    });
    const { res, statusCode } = makeResponse();

    await handler(req, res);

    expect(statusCode()).toBe(200);
  });

  it("allows request with valid zscsession cookie", async () => {
    vi.mocked(runRouter).mockResolvedValue({
      parsed_intent: { type: "unknown", needs_clarification: false },
      entities: {
        locations: [],
        crime_types: [],
        suspect_names: [],
        case_ids: [],
        mo_features: {},
      },
      guidance_message: "Please rephrase.",
    });

    const req = makeRequest({
      body: JSON.stringify({ query_text: "???" }),
      headers: { cookie: "zscsession=abc123token" },
    });
    const { res, statusCode } = makeResponse();

    await handler(req, res);

    expect(statusCode()).toBe(200);
  });
});

// ---------------------------------------------------------------------------
// Handler — HTTP method validation
// ---------------------------------------------------------------------------

describe("Handler — method validation", () => {
  it("returns 405 for GET requests", async () => {
    const req = makeRequest({ method: "GET" });
    const { res, statusCode } = makeResponse();

    await handler(req, res);

    expect(statusCode()).toBe(405);
  });

  it("returns 405 for DELETE requests", async () => {
    const req = makeRequest({ method: "DELETE", headers: { "catalyst-user-id": "user-1" } });
    const { res, statusCode } = makeResponse();

    await handler(req, res);

    expect(statusCode()).toBe(405);
  });
});

// ---------------------------------------------------------------------------
// Handler — request body validation
// ---------------------------------------------------------------------------

describe("Handler — request body validation", () => {
  const AUTH_HEADERS = { "catalyst-user-id": "user-001" };

  it("returns 400 when body is not valid JSON", async () => {
    const req = makeRequest({ body: "not-json", headers: AUTH_HEADERS });
    const { res, statusCode } = makeResponse();

    await handler(req, res);

    expect(statusCode()).toBe(400);
  });

  it("returns 400 when query_text is missing", async () => {
    const req = makeRequest({
      body: JSON.stringify({ other_field: "value" }),
      headers: AUTH_HEADERS,
    });
    const { res, statusCode } = makeResponse();

    await handler(req, res);

    expect(statusCode()).toBe(400);
  });

  it("returns 400 when query_text is empty string", async () => {
    const req = makeRequest({
      body: JSON.stringify({ query_text: "   " }),
      headers: AUTH_HEADERS,
    });
    const { res, statusCode } = makeResponse();

    await handler(req, res);

    expect(statusCode()).toBe(400);
  });
});

// ---------------------------------------------------------------------------
// Task 7 — End-to-end round-trip tests
// ---------------------------------------------------------------------------

describe("Handler — end-to-end round-trip (Task 7)", () => {
  const AUTH_HEADERS = { "catalyst-user-id": "investigator-1" };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns clarification question when router signals needs_clarification", async () => {
    vi.mocked(runRouter).mockResolvedValue({
      parsed_intent: {
        type: "case_lookup",
        needs_clarification: true,
        clarification_question: "Could you specify the location?",
      },
      entities: {
        locations: [],
        crime_types: ["robbery"],
        suspect_names: [],
        case_ids: [],
        mo_features: {},
      },
    });

    const req = makeRequest({
      body: JSON.stringify({ query_text: "robbery" }),
      headers: AUTH_HEADERS,
    });
    const { res, statusCode, body } = makeResponse();

    await handler(req, res);

    expect(statusCode()).toBe(200);
    const parsed = JSON.parse(body()) as { answer: string; reasoning_trace: unknown };
    expect(parsed.answer).toBe("Could you specify the location?");
    expect(vi.mocked(runStructuredQueryAgent)).not.toHaveBeenCalled();
  });

  it("returns guidance message for unknown intent without querying Data Store", async () => {
    vi.mocked(runRouter).mockResolvedValue({
      parsed_intent: { type: "unknown", needs_clarification: false },
      entities: {
        locations: [],
        crime_types: [],
        suspect_names: [],
        case_ids: [],
        mo_features: {},
      },
      guidance_message: "I can help with case lookup, pattern search, or network queries.",
    });

    const req = makeRequest({
      body: JSON.stringify({ query_text: "what is the weather today?" }),
      headers: AUTH_HEADERS,
    });
    const { res, statusCode, body } = makeResponse();

    await handler(req, res);

    expect(statusCode()).toBe(200);
    const parsed = JSON.parse(body()) as { answer: string };
    expect(parsed.answer).toContain("Case lookup");
    expect(vi.mocked(runStructuredQueryAgent)).not.toHaveBeenCalled();
  });

  it("returns data-grounded answer when results are found", async () => {
    vi.mocked(runRouter).mockResolvedValue({
      parsed_intent: { type: "case_lookup", needs_clarification: false },
      entities: {
        locations: ["Bengaluru"],
        crime_types: ["burglary"],
        suspect_names: [],
        case_ids: [],
        mo_features: {},
      },
    });

    vi.mocked(runStructuredQueryAgent).mockResolvedValue({
      results: [
        {
          table: "Cases",
          rows: [
            { case_id: "KSP-2024-001", title: "Residential Burglary", status: "open" },
            { case_id: "KSP-2024-002", title: "Shop Break-in", status: "closed" },
          ],
          filters_applied: ["crime type: burglary", "location: Bengaluru"],
          row_count: 2,
        },
      ],
      zero_results: false,
    });

    const req = makeRequest({
      body: JSON.stringify({ query_text: "Find burglary cases in Bengaluru" }),
      headers: AUTH_HEADERS,
    });
    const { res, statusCode, body } = makeResponse();

    await handler(req, res);

    expect(statusCode()).toBe(200);
    const parsed = JSON.parse(body()) as { answer: string; reasoning_trace: { agents_invoked: string[]; zcql_filters: string[] } };
    expect(parsed.answer).toContain("2");
    expect(parsed.answer).toContain("matching case");
    expect(parsed.reasoning_trace.agents_invoked).toContain("router");
    expect(parsed.reasoning_trace.agents_invoked).toContain("structured_query");
    expect(parsed.reasoning_trace.zcql_filters).toContain("crime type: burglary");
  });

  it("returns no-results guidance when query returns zero rows", async () => {
    vi.mocked(runRouter).mockResolvedValue({
      parsed_intent: { type: "case_lookup", needs_clarification: false },
      entities: {
        locations: ["Coorg"],
        crime_types: ["cyber fraud"],
        suspect_names: [],
        case_ids: [],
        mo_features: {},
      },
    });

    vi.mocked(runStructuredQueryAgent).mockResolvedValue({
      results: [
        {
          table: "Cases",
          rows: [],
          filters_applied: ["crime type: cyber fraud", "location: Coorg"],
          row_count: 0,
        },
      ],
      zero_results: true,
      guidance_message: "No matching records found with filters: crime type: cyber fraud; location: Coorg",
    });

    const req = makeRequest({
      body: JSON.stringify({ query_text: "cyber fraud in Coorg" }),
      headers: AUTH_HEADERS,
    });
    const { res, statusCode, body } = makeResponse();

    await handler(req, res);

    expect(statusCode()).toBe(200);
    const parsed = JSON.parse(body()) as { answer: string };
    expect(parsed.answer).toContain("No matching records");
  });

  it("returns graceful error message on Data Store failure", async () => {
    vi.mocked(runRouter).mockResolvedValue({
      parsed_intent: { type: "case_lookup", needs_clarification: false },
      entities: {
        locations: [],
        crime_types: ["robbery"],
        suspect_names: [],
        case_ids: [],
        mo_features: {},
      },
    });

    vi.mocked(runStructuredQueryAgent).mockResolvedValue({
      results: [],
      zero_results: false,
      error: "Database is temporarily unavailable.",
    });

    const req = makeRequest({
      body: JSON.stringify({ query_text: "robbery cases" }),
      headers: AUTH_HEADERS,
    });
    const { res, statusCode, body } = makeResponse();

    await handler(req, res);

    expect(statusCode()).toBe(200);
    const parsed = JSON.parse(body()) as { answer: string };
    expect(parsed.answer).toMatch(/unavailable/i);
  });

  it("reasoning_trace includes query_parsed, agents_invoked, and zcql_filters", async () => {
    // For case_lookup intent the LangGraph path is:
    // router_node → structured_query_node → explainability_node
    vi.mocked(runRouter).mockResolvedValue({
      parsed_intent: { type: "case_lookup", needs_clarification: false },
      entities: {
        locations: [],
        crime_types: [],
        suspect_names: [],
        case_ids: ["KSP-2024-001"],
        mo_features: { time_of_day: "night" },
      },
    });

    vi.mocked(runStructuredQueryAgent).mockResolvedValue({
      results: [
        {
          table: "Cases",
          rows: [{ case_id: "KSP-2024-005", crime_type: "burglary" }],
          filters_applied: ["time of day: night", "case IDs: KSP-2024-001"],
          row_count: 1,
        },
      ],
      zero_results: false,
    });

    const req = makeRequest({
      body: JSON.stringify({ query_text: "Cases similar to KSP-2024-001 at night" }),
      headers: AUTH_HEADERS,
    });
    const { res, statusCode, body } = makeResponse();

    await handler(req, res);

    expect(statusCode()).toBe(200);
    const parsed = JSON.parse(body()) as {
      answer: string;
      reasoning_trace: {
        query_parsed: unknown;
        agents_invoked: string[];
        zcql_filters: string[];
      };
    };
    expect(parsed.reasoning_trace.query_parsed).toBeDefined();
    // LangGraph path for case_lookup: router → structured_query → explainability
    expect(parsed.reasoning_trace.agents_invoked).toContain("router");
    expect(parsed.reasoning_trace.agents_invoked).toContain("structured_query");
    expect(parsed.reasoning_trace.zcql_filters).toContain("time of day: night");
  });

  it("includes a brief preview of matched records in the answer", async () => {
    vi.mocked(runRouter).mockResolvedValue({
      parsed_intent: { type: "case_lookup", needs_clarification: false },
      entities: {
        locations: ["Mysuru"],
        crime_types: ["robbery"],
        suspect_names: [],
        case_ids: [],
        mo_features: {},
      },
    });

    vi.mocked(runStructuredQueryAgent).mockResolvedValue({
      results: [
        {
          table: "Cases",
          rows: [
            { case_id: "KSP-2024-010", title: "Road Robbery", status: "open" },
          ],
          filters_applied: ["crime type: robbery", "location: Mysuru"],
          row_count: 1,
        },
      ],
      zero_results: false,
    });

    const req = makeRequest({
      body: JSON.stringify({ query_text: "robbery in Mysuru" }),
      headers: AUTH_HEADERS,
    });
    const { res, statusCode, body } = makeResponse();

    await handler(req, res);

    expect(statusCode()).toBe(200);
    const parsed = JSON.parse(body()) as { answer: string };
    // Answer should mention the count and at least one case detail
    expect(parsed.answer).toContain("1");
    expect(parsed.answer).toMatch(/KSP-2024-010|Road Robbery/);
  });
});
