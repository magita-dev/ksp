export interface ZiaEntity {
  value: string;
  type: string;
  confidence?: number;
}

export interface MOFeatures {
  entry_method: string;
  time_of_day: "morning" | "afternoon" | "evening" | "night";
  weapon_type: string;
  victim_age_group: "child" | "youth" | "adult" | "elderly";
  target_type: string;
}

export interface ParsedIntent {
  type: "case_lookup" | "pattern_search" | "network_query" | "combined" | "unknown";
  needs_clarification: boolean;
  clarification_question?: string;
}

export interface ExtractedEntities {
  locations: string[];
  date_range?: { from: string; to: string };
  crime_types: string[];
  suspect_names: string[];
  case_ids: string[];
  mo_features: Partial<MOFeatures>;
  zia_entities?: ZiaEntity[];
}

export interface QueryResult {
  table: string;
  rows: Record<string, unknown>[];
  filters_applied: string[];
  row_count: number;
}

export interface LinkedCase {
  case_id: string;
  jaccard_score: number;
  matching_features: string[];
  zia_entity_overlap: string[];
}

export interface NetworkEntity {
  id: string;
  type: "suspect" | "case" | "location";
  label: string;
  hop_distance: number;
}

export interface NetworkEdge {
  from_id: string;
  to_id: string;
  relationship: string;
}

export interface NetworkResult {
  entities: NetworkEntity[];
  edges: NetworkEdge[];
  paginated: boolean;
  total_count: number;
}

export interface ReasoningTrace {
  query_parsed: (ParsedIntent & ExtractedEntities) | null;
  agents_invoked: string[];
  zcql_filters: string[];
  jaccard_scores: Array<{ case_id: string; score: number; matching_features: string[] }>;
  zia_entities: ZiaEntity[];
  traversal_path?: NetworkEdge[];
  failed_step?: string;
  partial_results?: unknown;
}

export interface AuditRecord {
  audit_id: string;
  queried_by: string;
  query_text: string;
  agents_invoked: string[];
  tables_accessed: string[];
  pii_access: boolean;
  timestamp: string;
  reasoning_trace_json: string;
  retention_expires_at: string;
}

export interface AgentError {
  agent: string;
  code: "ZCQL_ERROR" | "LLM_ERROR" | "ZIA_ERROR" | "TIMEOUT" | "VALIDATION_ERROR";
  message: string;
  partial_trace: ReasoningTrace;
}

export interface CatalystSession {
  user_id: string;
  token: string;
}

export interface AgentState {
  query_text: string;
  session: CatalystSession;
  parsed_intent: ParsedIntent | null;
  entities: ExtractedEntities | null;
  structured_results: QueryResult[] | null;
  linked_cases: LinkedCase[] | null;
  network_results: NetworkResult | null;
  reasoning_trace: ReasoningTrace;
  error: AgentError | null;
  needs_clarification: boolean;
  clarification_question: string | null;
}

export interface ConversationMessage {
  id: string;
  role: "user" | "assistant";
  text: string;
  reasoning_trace?: ReasoningTrace;
  timestamp: Date;
}

export interface VoiceInterfaceState {
  supported: boolean;
  active: boolean;
  locale: "en-IN" | "kn-IN";
  transcript: string | null;
}

export function emptyReasoningTrace(): ReasoningTrace {
  return {
    query_parsed: null,
    agents_invoked: [],
    zcql_filters: [],
    jaccard_scores: [],
    zia_entities: [],
  };
}
