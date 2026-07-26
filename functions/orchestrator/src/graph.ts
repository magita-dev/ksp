/**
 * LangGraph Orchestrator — directed agent graph
 *
 * Declares all graph nodes and conditional edges that implement the
 * intent-type routing table from the design document.
 *
 * Node map:
 *   router_node          → parse intent + extract entities (Router agent)
 *   structured_query_node → ZCQL lookup (Structured Query Agent)
 *   case_linking_node    → Jaccard pattern matching (Case Linking Agent stub)
 *   network_analysis_node → multi-hop graph traversal (Network Analysis Agent stub)
 *   explainability_node  → assemble ReasoningTrace + final answer
 *   clarification_node   → return clarification question; no downstream routing
 *   error_node           → assemble partial trace + user-facing error message
 *
 * Conditional edges from router_node:
 *   intent.type === "case_lookup"     → structured_query_node
 *   intent.type === "pattern_search"  → case_linking_node
 *   intent.type === "network_query"   → network_analysis_node
 *   intent.type === "combined"        → structured_query_node (then also case_linking + network in the combined path)
 *   intent.needs_clarification===true → clarification_node
 *   intent.type === "unknown"         → error_node
 *   AgentState.error !== null         → error_node (from any node)
 *
 * Requirements: 6.1, 6.2, 6.3, 6.4
 */

import { StateGraph, START, END } from "@langchain/langgraph";
import type {
  AgentState,
  ParsedIntent,
  ExtractedEntities,
  ReasoningTrace,
} from "./types";
import { emptyReasoningTrace } from "./types";
import { runRouter } from "./agents/router";
import { runStructuredQueryAgent } from "./agents/structuredQuery";
import { runCaseLinkingAgent } from "./agents/caseLinking";
import { runNetworkAnalysisAgent } from "./agents/networkAnalysis";
import { runExplainabilityNode } from "./agents/explainability";

// ---------------------------------------------------------------------------
// Graph result type — what the compiled graph returns
// ---------------------------------------------------------------------------

export interface GraphResult {
  answer: string;
  reasoning_trace: ReasoningTrace;
}

// ---------------------------------------------------------------------------
// Node implementations
// Each node receives the full AgentState and returns a partial update.
// LangGraph merges the partial update into the state automatically.
// ---------------------------------------------------------------------------

/**
 * router_node — runs the Router/Query Understanding Agent.
 * Writes: parsed_intent, entities, needs_clarification, clarification_question
 * Appends: "router" to reasoning_trace.agents_invoked
 */
async function routerNode(
  state: AgentState,
  config: { app?: unknown } = {}
): Promise<Partial<AgentState>> {
  const app = config.app ?? null;

  // Allow injecting a mock Gemini client via state for testability
  const geminiClient = (state as AgentState & { _geminiClient?: unknown })._geminiClient as
    | Parameters<typeof runRouter>[2]
    | undefined;

  try {
    const { parsed_intent, entities } = await runRouter(
      state.query_text,
      app,
      geminiClient
    );

    const updatedTrace: ReasoningTrace = {
      ...state.reasoning_trace,
      agents_invoked: [...state.reasoning_trace.agents_invoked, "router"],
      query_parsed: { ...parsed_intent, ...entities },
    };

    return {
      parsed_intent,
      entities,
      needs_clarification: parsed_intent.needs_clarification,
      clarification_question: parsed_intent.clarification_question ?? null,
      reasoning_trace: updatedTrace,
    };
  } catch (err) {
    const message =
      err instanceof Error ? err.message : "Router agent encountered an error.";
    return {
      error: {
        agent: "router",
        code: "LLM_ERROR",
        message: "Query parsing failed. Please try again.",
        partial_trace: {
          ...state.reasoning_trace,
          agents_invoked: [...state.reasoning_trace.agents_invoked, "router"],
          failed_step: "router",
        },
      },
      reasoning_trace: {
        ...state.reasoning_trace,
        agents_invoked: [...state.reasoning_trace.agents_invoked, "router"],
        failed_step: "router",
      },
    };
    void message;
  }
}

/**
 * structured_query_node — runs the Structured Query Agent.
 * Writes: structured_results
 * Appends: "structured_query" to reasoning_trace.agents_invoked
 */
async function structuredQueryNode(
  state: AgentState,
  config: { app?: unknown } = {}
): Promise<Partial<AgentState>> {
  if (!state.parsed_intent || !state.entities) {
    return {
      error: {
        agent: "structured_query",
        code: "VALIDATION_ERROR",
        message: "Missing intent or entities from router.",
        partial_trace: state.reasoning_trace,
      },
    };
  }

  // Allow injecting a mock ZCQL executor via state for testability
  const zcqlExecutor = (state as AgentState & { _zcqlExecutor?: unknown })
    ._zcqlExecutor as Parameters<typeof runStructuredQueryAgent>[3] | undefined;

  const app = config.app ?? null;

  try {
    const sqResult = await runStructuredQueryAgent(
      state.parsed_intent,
      state.entities,
      app,
      zcqlExecutor
    );

    const allFilters = sqResult.results.flatMap((r) => r.filters_applied);
    const zcql_filters = [...new Set(allFilters)];

    const updatedTrace: ReasoningTrace = {
      ...state.reasoning_trace,
      agents_invoked: [...state.reasoning_trace.agents_invoked, "structured_query"],
      zcql_filters,
    };

    return {
      structured_results: sqResult.error ? [] : sqResult.results,
      reasoning_trace: updatedTrace,
      // Surface Data Store error into AgentState.error
      ...(sqResult.error
        ? {
            error: {
              agent: "structured_query",
              code: "ZCQL_ERROR" as const,
              message: sqResult.error,
              partial_trace: updatedTrace,
            },
          }
        : {}),
    };
  } catch (err) {
    const updatedTrace: ReasoningTrace = {
      ...state.reasoning_trace,
      agents_invoked: [...state.reasoning_trace.agents_invoked, "structured_query"],
      failed_step: "structured_query",
    };
    return {
      structured_results: [],
      reasoning_trace: updatedTrace,
      error: {
        agent: "structured_query",
        code: "ZCQL_ERROR",
        message: "Database is temporarily unavailable.",
        partial_trace: updatedTrace,
      },
    };
    void err;
  }
}

/**
 * case_linking_node — runs the Case Linking Agent (stub in this task).
 * Writes: linked_cases
 * Appends: "case_linking" to reasoning_trace.agents_invoked
 */
async function caseLinkingNode(
  state: AgentState,
  config: { app?: unknown } = {}
): Promise<Partial<AgentState>> {
  const zcqlExecutor = (state as AgentState & { _zcqlExecutor?: unknown })
    ._zcqlExecutor as Parameters<typeof runCaseLinkingAgent>[2] | undefined;
  const app = config.app ?? null;
  return runCaseLinkingAgent(state, app, zcqlExecutor);
}

/**
 * network_analysis_node — runs the Network Analysis Agent (stub in this task).
 * Writes: network_results
 * Appends: "network_analysis" to reasoning_trace.agents_invoked
 */
async function networkAnalysisNode(
  state: AgentState,
  config: { app?: unknown } = {}
): Promise<Partial<AgentState>> {
  const zcqlExecutor = (state as AgentState & { _zcqlExecutor?: unknown })
    ._zcqlExecutor as Parameters<typeof runNetworkAnalysisAgent>[2] | undefined;
  const app = config.app ?? null;
  return runNetworkAnalysisAgent(state, app, zcqlExecutor);
}

/**
 * explainability_node — assembles the final ReasoningTrace.
 * Writes: reasoning_trace (final assembled form)
 * Appends: "explainability" to agents_invoked
 */
async function explainabilityNode(
  state: AgentState
): Promise<Partial<AgentState>> {
  const { reasoning_trace } = runExplainabilityNode(state);

  const updatedTrace: ReasoningTrace = {
    ...reasoning_trace,
    agents_invoked: [...reasoning_trace.agents_invoked, "explainability"],
  };

  return {
    reasoning_trace: updatedTrace,
  };
}

/**
 * clarification_node — returns the clarification question; does not route downstream.
 * Appends: "clarification" to reasoning_trace.agents_invoked
 */
async function clarificationNode(
  state: AgentState
): Promise<Partial<AgentState>> {
  const updatedTrace: ReasoningTrace = {
    ...state.reasoning_trace,
    agents_invoked: [...state.reasoning_trace.agents_invoked, "clarification"],
  };

  return {
    reasoning_trace: updatedTrace,
  };
}

/**
 * error_node — assembles the partial ReasoningTrace collected up to failure.
 * Sets failed_step and partial_results. Returns a user-facing message.
 * For unknown-intent, surfaces the detailed guidance message from the router.
 * Appends: "error" to reasoning_trace.agents_invoked
 */
async function errorNode(state: AgentState): Promise<Partial<AgentState>> {
  const partialTrace: ReasoningTrace = {
    ...state.reasoning_trace,
    agents_invoked: [...state.reasoning_trace.agents_invoked, "error"],
    failed_step: state.error?.agent ?? state.reasoning_trace.failed_step ?? "unknown",
    partial_results: state.error?.partial_trace ?? state.reasoning_trace.partial_results,
  };

  return {
    reasoning_trace: partialTrace,
  };
}

// GUIDANCE_MESSAGE mirrors the Router's guidance for unknown-intent responses.
const GUIDANCE_MESSAGE =
  "I can help you with the following types of questions:\n" +
  "\u2022 Case lookup \u2014 Find cases by location, date, crime type, suspect, or case ID.\n" +
  "  Example: 'Show burglary cases in Bengaluru last month'\n" +
  "\u2022 Pattern search \u2014 Find cases with similar modus operandi.\n" +
  "  Example: 'Cases similar to KSP-2024-001' or 'Robberies at night using forced entry'\n" +
  "\u2022 Network query \u2014 Explore connections between suspects, cases, and locations.\n" +
  "  Example: 'Show connections between suspect S-001 and other cases'\n\n" +
  "Please rephrase your query using one of these formats.";

// ---------------------------------------------------------------------------
// Routing logic (conditional edges from router_node)
// ---------------------------------------------------------------------------

type NodeName =
  | "structured_query_node"
  | "case_linking_node"
  | "network_analysis_node"
  | "clarification_node"
  | "error_node"
  | "explainability_node"
  | typeof END;

/**
 * Determines which node(s) to route to after router_node executes.
 * Returns a single node name; LangGraph evaluates this after each router_node run.
 *
 * For the "combined" intent, we route to structured_query_node first;
 * subsequent combined-path nodes are chained via additional conditional edges.
 */
function routerConditional(state: AgentState): NodeName {
  // If router set an error, go straight to error_node
  if (state.error !== null) {
    return "error_node";
  }

  const intent = state.parsed_intent;
  if (!intent) {
    return "error_node";
  }

  // Clarification supersedes intent type
  if (intent.needs_clarification) {
    return "clarification_node";
  }

  switch (intent.type) {
    case "case_lookup":
      return "structured_query_node";
    case "pattern_search":
      return "case_linking_node";
    case "network_query":
      return "network_analysis_node";
    case "combined":
      // Fan-out: structured_query_node is first; remaining nodes are chained
      return "structured_query_node";
    case "unknown":
    default:
      return "error_node";
  }
}

/**
 * After structured_query_node, decide next step:
 * - If error → error_node
 * - If combined intent → case_linking_node (continue fan-out)
 * - Otherwise → explainability_node
 */
function afterStructuredQueryConditional(state: AgentState): NodeName {
  if (state.error !== null) {
    return "error_node";
  }
  if (state.parsed_intent?.type === "combined") {
    return "case_linking_node";
  }
  return "explainability_node";
}

/**
 * After case_linking_node, decide next step:
 * - If error → error_node
 * - If combined intent → network_analysis_node (continue fan-out)
 * - Otherwise → explainability_node
 */
function afterCaseLinkingConditional(state: AgentState): NodeName {
  if (state.error !== null) {
    return "error_node";
  }
  if (state.parsed_intent?.type === "combined") {
    return "network_analysis_node";
  }
  return "explainability_node";
}

/**
 * After network_analysis_node → always go to explainability_node
 * (unless error).
 */
function afterNetworkAnalysisConditional(state: AgentState): NodeName {
  if (state.error !== null) {
    return "error_node";
  }
  return "explainability_node";
}

// ---------------------------------------------------------------------------
// Build and compile the StateGraph
// ---------------------------------------------------------------------------

/**
 * Build the LangGraph StateGraph for the KSP Crime AI orchestrator.
 *
 * The state type is AgentState. Because LangGraph 1.x with TypeScript needs
 * a plain-object state definition (not class-based channels for this version),
 * we pass the state as a typed record and let LangGraph handle merging via
 * its default last-write-wins reducer for each returned partial update.
 *
 * @param app  Catalyst app instance forwarded to nodes that need Data Store access.
 */
export function buildGraph(app: unknown = null) {
  // LangGraph StateGraph requires a channels/state definition.
  // We supply a default-value factory so the graph knows how to initialise state.
  const graph = new StateGraph<AgentState>({
    channels: {
      query_text: { value: (a: string, b: string) => b ?? a, default: () => "" },
      session: {
        value: (
          a: AgentState["session"],
          b: AgentState["session"]
        ) => b ?? a,
        default: () => ({ user_id: "", token: "" }),
      },
      parsed_intent: {
        value: (
          a: ParsedIntent | null,
          b: ParsedIntent | null
        ) => b ?? a,
        default: () => null,
      },
      entities: {
        value: (
          a: ExtractedEntities | null,
          b: ExtractedEntities | null
        ) => b ?? a,
        default: () => null,
      },
      structured_results: {
        value: (a: AgentState["structured_results"], b: AgentState["structured_results"]) => b ?? a,
        default: () => null,
      },
      linked_cases: {
        value: (a: AgentState["linked_cases"], b: AgentState["linked_cases"]) => b ?? a,
        default: () => null,
      },
      network_results: {
        value: (a: AgentState["network_results"], b: AgentState["network_results"]) => b ?? a,
        default: () => null,
      },
      reasoning_trace: {
        value: (a: ReasoningTrace, b: ReasoningTrace) => b ?? a,
        default: emptyReasoningTrace,
      },
      error: {
        value: (a: AgentState["error"], b: AgentState["error"]) => b ?? a,
        default: () => null,
      },
      needs_clarification: {
        value: (a: boolean, b: boolean) => (b !== undefined ? b : a),
        default: () => false,
      },
      clarification_question: {
        value: (a: string | null, b: string | null) => b ?? a,
        default: () => null,
      },
    },
  });

  // -------------------------------------------------------------------------
  // Add nodes
  // -------------------------------------------------------------------------

  graph.addNode("router_node", (state: AgentState) =>
    routerNode(state, { app })
  );
  graph.addNode("structured_query_node", (state: AgentState) =>
    structuredQueryNode(state, { app })
  );
  graph.addNode("case_linking_node", (state: AgentState) =>
    caseLinkingNode(state, { app })
  );
  graph.addNode("network_analysis_node", (state: AgentState) =>
    networkAnalysisNode(state, { app })
  );
  graph.addNode("explainability_node", explainabilityNode);
  graph.addNode("clarification_node", clarificationNode);
  graph.addNode("error_node", errorNode);

  // -------------------------------------------------------------------------
  // Add edges
  // -------------------------------------------------------------------------

  // Entry point
  graph.addEdge(START, "router_node" as any);

  // Conditional routing from router_node
  graph.addConditionalEdges("router_node" as any, routerConditional as any, {
    structured_query_node: "structured_query_node",
    case_linking_node: "case_linking_node",
    network_analysis_node: "network_analysis_node",
    clarification_node: "clarification_node",
    error_node: "error_node",
  } as any);

  // After structured_query_node: combined fan-out or explainability
  graph.addConditionalEdges(
    "structured_query_node" as any,
    afterStructuredQueryConditional as any,
    {
      case_linking_node: "case_linking_node",
      explainability_node: "explainability_node",
      error_node: "error_node",
    } as any
  );

  // After case_linking_node: combined fan-out (→ network) or explainability
  graph.addConditionalEdges(
    "case_linking_node" as any,
    afterCaseLinkingConditional as any,
    {
      network_analysis_node: "network_analysis_node",
      explainability_node: "explainability_node",
      error_node: "error_node",
    } as any
  );

  // After network_analysis_node → explainability or error
  graph.addConditionalEdges(
    "network_analysis_node" as any,
    afterNetworkAnalysisConditional as any,
    {
      explainability_node: "explainability_node",
      error_node: "error_node",
    } as any
  );

  // Terminal nodes → END
  graph.addEdge("explainability_node" as any, END);
  graph.addEdge("clarification_node" as any, END);
  graph.addEdge("error_node" as any, END);

  return graph.compile();
}

// ---------------------------------------------------------------------------
// Convenience: run the full graph and return a GraphResult
// ---------------------------------------------------------------------------

/**
 * Run the complete agent graph for a query.
 *
 * @param queryText  The investigator's natural language query.
 * @param userId     Catalyst Auth user ID (for audit + session).
 * @param token      Catalyst Auth session token.
 * @param app        Catalyst app instance (null in tests).
 * @param overrides  Optional state overrides for testing (e.g. _geminiClient, _zcqlExecutor).
 */
export async function runGraph(
  queryText: string,
  userId: string,
  token: string,
  app: unknown = null,
  overrides: Partial<AgentState & { _geminiClient?: unknown; _zcqlExecutor?: unknown }> = {}
): Promise<GraphResult> {
  const compiledGraph = buildGraph(app);

  const initialState: AgentState & { _geminiClient?: unknown; _zcqlExecutor?: unknown } = {
    query_text: queryText,
    session: { user_id: userId, token },
    parsed_intent: null,
    entities: null,
    structured_results: null,
    linked_cases: null,
    network_results: null,
    reasoning_trace: emptyReasoningTrace(),
    error: null,
    needs_clarification: false,
    clarification_question: null,
    ...overrides,
  };

  const finalState = await compiledGraph.invoke(initialState as any);

  // Extract final answer from the reasoning trace / state
  const { answer } = runExplainabilityNode(finalState as unknown as AgentState);

  return {
    answer,
    reasoning_trace: (finalState as unknown as AgentState).reasoning_trace,
  };
}
