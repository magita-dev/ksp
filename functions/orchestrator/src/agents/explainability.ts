/**
 * Explainability Layer
 *
 * Assembles the final ReasoningTrace from AgentState and writes the audit log.
 * Handles the error path: if AgentState.error is set, populates failed_step
 * and partial_results in the trace.
 *
 * Requirements: 4.1, 4.3, 4.5
 */

import type { AgentState, ReasoningTrace } from "../types";

export interface ExplainabilityOutput {
  answer: string;
  reasoning_trace: ReasoningTrace;
}

/**
 * Run the Explainability Node.
 *
 * Assembles the final ReasoningTrace from all fields collected across
 * the invoked agent nodes, ensuring all required fields are present
 * (using empty lists / null for fields not populated by the current intent path).
 *
 * @param state  Final AgentState after all agent nodes have executed.
 */
export function runExplainabilityNode(state: AgentState): ExplainabilityOutput {
  // Collect ZCQL filters from structured results (Requirement 4.1)
  const zcql_filters: string[] = state.structured_results
    ? state.structured_results.flatMap((r) => r.filters_applied)
    : state.reasoning_trace.zcql_filters;

  // Collect Jaccard scores from linked cases (Requirement 4.1)
  const jaccard_scores = state.linked_cases
    ? state.linked_cases.map((lc) => ({
        case_id: lc.case_id,
        score: lc.jaccard_score,
        matching_features: lc.matching_features,
      }))
    : state.reasoning_trace.jaccard_scores;

  // Collect Zia entities (Requirement 4.1)
  const zia_entities =
    state.entities?.zia_entities ?? state.reasoning_trace.zia_entities ?? [];

  // Assemble the complete ReasoningTrace (Requirement 4.1, 4.3)
  const trace: ReasoningTrace = {
    query_parsed: state.parsed_intent && state.entities
      ? { ...state.parsed_intent, ...state.entities }
      : state.reasoning_trace.query_parsed,
    agents_invoked: state.reasoning_trace.agents_invoked,
    zcql_filters: [...new Set(zcql_filters)],
    jaccard_scores,
    zia_entities,
    traversal_path: state.network_results?.edges ?? state.reasoning_trace.traversal_path,
  };

  // Error path: annotate with failed_step and partial_results (Requirement 4.5)
  if (state.error) {
    trace.failed_step = state.error.agent;
    trace.partial_results = state.error.partial_trace;
  }

  // Build answer text
  let answer: string;

  if (state.error) {
    answer = state.error.message;
  } else if (state.needs_clarification) {
    answer = state.clarification_question ?? "Could you provide more details?";
  } else if (state.parsed_intent?.type === "unknown") {
    answer =
      "I can help you with the following types of questions:\n" +
      "\u2022 Case lookup \u2014 Find cases by location, date, crime type, suspect, or case ID.\n" +
      "  Example: 'Show burglary cases in Bengaluru last month'\n" +
      "\u2022 Pattern search \u2014 Find cases with similar modus operandi.\n" +
      "  Example: 'Cases similar to KSP-2024-001' or 'Robberies at night using forced entry'\n" +
      "\u2022 Network query \u2014 Explore connections between suspects, cases, and locations.\n" +
      "  Example: 'Show connections between suspect S-001 and other cases'\n\n" +
      "Please rephrase your query using one of these formats.";
  } else if (state.linked_cases !== null && state.linked_cases !== undefined && state.linked_cases.length > 0) {
    // Pattern-search answer path: list pattern matches with Jaccard scores and matching features
    const matchLines = state.linked_cases.map((lc) => {
      const score = lc.jaccard_score.toFixed(2);
      const features = lc.matching_features.join(", ");
      return `• ${lc.case_id} (similarity: ${score}) — matching features: ${features}`;
    });
    answer =
      `Potential pattern matches for investigator review (${state.linked_cases.length} case${state.linked_cases.length === 1 ? "" : "s"}):\n` +
      matchLines.join("\n");
  } else if (state.network_results !== null && state.network_results !== undefined && state.network_results.entities.length > 0) {
    // Network-query answer path: mention entity count and pagination status
    const { entities, total_count, paginated } = state.network_results;
    const shown = entities.length;
    if (paginated) {
      answer = `Found ${total_count} connected entities. Showing ${shown} of ${total_count} connections. Refine your query to see a specific subset.`;
    } else {
      answer = `Found ${shown} connected entit${shown === 1 ? "y" : "ies"} in the network.`;
    }
  } else if (state.structured_results !== null && state.structured_results !== undefined) {
    const totalRows = state.structured_results.reduce((sum, r) => sum + r.row_count, 0);
    if (totalRows === 0) {
      const allFilters = state.structured_results.flatMap((r) => r.filters_applied);
      const unique = [...new Set(allFilters)];
      answer = `No matching records found with filters: ${unique.join("; ") || "none"}`;
    } else {
      const previewRows: string[] = [];
      for (const result of state.structured_results) {
        for (const row of result.rows.slice(0, 3)) {
          const caseId = row["case_id"] ?? row["suspect_id"] ?? row["ROWID"] ?? "";
          const title = row["title"] ?? row["name"] ?? row["crime_type"] ?? "";
          const status = row["status"] ?? "";
          const parts = [caseId, title, status].filter((v) => v !== "").join(" — ");
          if (parts) previewRows.push(parts);
        }
        if (previewRows.length >= 3) break;
      }
      const summary = previewRows.length > 0 ? ` ${previewRows.join("; ")}.` : "";
      answer = `Found ${totalRows} matching case${totalRows === 1 ? "" : "s"}.${summary}`;
    }
  } else {
    answer = "Query processed successfully.";
  }

  return { answer, reasoning_trace: trace };
}

/**
 * Run the Explainability Node as a LangGraph-compatible node function.
 * Returns a partial AgentState update with the final reasoning_trace populated.
 */
export async function runExplainabilityAgentNode(
  state: AgentState,
  _app: unknown
): Promise<Partial<AgentState>> {
  const { reasoning_trace } = runExplainabilityNode(state);

  const updatedTrace = {
    ...reasoning_trace,
    agents_invoked: [...reasoning_trace.agents_invoked, "explainability"],
  };

  return {
    reasoning_trace: updatedTrace,
  };
}
