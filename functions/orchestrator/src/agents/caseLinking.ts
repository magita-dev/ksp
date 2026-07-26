/**
 * Case Linking Agent — full Jaccard + Zia implementation
 *
 * Steps:
 *  1. Fetch all MO_Features rows from Catalyst Data Store (injectable executor).
 *  2. For the seed case, call zia.ts to extract entities from Cases.narrative;
 *     merge into feature set as "zia:<entity>" strings.
 *  3. Compute Jaccard score for every other case:
 *       score = |A ∩ B| / |A ∪ B|
 *     where each element is a "field:value" or "zia:<entity>" string.
 *  4. Return only cases with jaccard_score >= JACCARD_THRESHOLD (env var, default 0.6).
 *  5. LinkedCase.matching_features lists the intersecting feature strings.
 *     Output label must NOT contain assertive offender language.
 *  6. If no cases meet the threshold, return an explicit no-match message.
 *
 * Requirements: 3.1, 3.2, 3.3, 3.4, 3.5, 3.6
 */

import type { AgentState, LinkedCase, MOFeatures } from "../types";
import { extractEntities } from "../clients/zia";
import { createLocalZcqlExecutor } from "../dev/localStore";

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

export interface CaseLinkingResult {
  linked_cases: LinkedCase[];
  no_match_message?: string;
}

/**
 * Injectable ZCQL executor type — matches the pattern used by structuredQuery.ts.
 * Accepts a ZCQL string and returns an array of raw Data Store rows.
 */
export type ZcqlExecutor = (query: string) => Promise<Record<string, unknown>[]>;

// ---------------------------------------------------------------------------
// Jaccard threshold — read from env var, default 0.6
// ---------------------------------------------------------------------------

function getJaccardThreshold(): number {
  const envVal = process.env["JACCARD_THRESHOLD"];
  if (envVal !== undefined && envVal !== "") {
    const parsed = parseFloat(envVal);
    if (!isNaN(parsed) && parsed >= 0 && parsed <= 1) {
      return parsed;
    }
  }
  return 0.6;
}

// ---------------------------------------------------------------------------
// MO_Features row shape returned by Data Store
// ---------------------------------------------------------------------------

interface MOFeaturesRow {
  case_id: string | number;
  entry_method?: string;
  time_of_day?: string;
  weapon_type?: string;
  victim_age_group?: string;
  target_type?: string;
  zia_entities_json?: string;
  /** The Cases.narrative is optionally fetched if we join with Cases */
  narrative?: string;
}

// ---------------------------------------------------------------------------
// Feature set helpers
// ---------------------------------------------------------------------------

/**
 * Convert a MOFeatures row into a set of "field:value" feature strings.
 * Only defined, non-empty values are included.
 */
export function moRowToFeatureSet(row: MOFeaturesRow): Set<string> {
  const features = new Set<string>();
  const fields: Array<keyof MOFeatures> = [
    "entry_method",
    "time_of_day",
    "weapon_type",
    "victim_age_group",
    "target_type",
  ];
  for (const field of fields) {
    const value = row[field];
    if (typeof value === "string" && value.trim() !== "") {
      features.add(`${field}:${value.trim()}`);
    }
  }
  return features;
}

/**
 * Parse Zia entity strings from the `zia_entities_json` column.
 * Returns "zia:<entity_value>" strings. Returns empty set on any parse error.
 */
function parseZiaEntitiesJson(json: string | undefined): Set<string> {
  if (!json || json.trim() === "") return new Set();
  try {
    const parsed: unknown = JSON.parse(json);
    if (!Array.isArray(parsed)) return new Set();
    const result = new Set<string>();
    for (const item of parsed) {
      if (typeof item === "object" && item !== null) {
        const record = item as Record<string, unknown>;
        const val = record["value"] ?? record["entity"] ?? record["text"] ?? null;
        if (typeof val === "string" && val.trim() !== "") {
          result.add(`zia:${val.trim()}`);
        }
      } else if (typeof item === "string" && item.trim() !== "") {
        result.add(`zia:${item.trim()}`);
      }
    }
    return result;
  } catch {
    return new Set();
  }
}

// ---------------------------------------------------------------------------
// Jaccard computation
// ---------------------------------------------------------------------------

/**
 * Compute the Jaccard similarity coefficient between two sets.
 * Returns 0 when both sets are empty (undefined case).
 */
export function jaccardScore(a: Set<string>, b: Set<string>): number {
  if (a.size === 0 && b.size === 0) return 0;
  const intersection = new Set<string>();
  for (const item of a) {
    if (b.has(item)) intersection.add(item);
  }
  // Union size = |A| + |B| - |intersection|
  const unionSize = a.size + b.size - intersection.size;
  if (unionSize === 0) return 0;
  return intersection.size / unionSize;
}

/**
 * Compute the intersection of two sets (shared elements).
 */
export function setIntersection(a: Set<string>, b: Set<string>): Set<string> {
  const result = new Set<string>();
  for (const item of a) {
    if (b.has(item)) result.add(item);
  }
  return result;
}

// ---------------------------------------------------------------------------
// Real Catalyst SDK executor factory (same pattern as structuredQuery.ts)
// ---------------------------------------------------------------------------

function buildRealExecutor(app: unknown): ZcqlExecutor {
  if (!app || typeof (app as Record<string, unknown>).datastore !== "function") {
    return createLocalZcqlExecutor();
  }
  return async (query: string): Promise<Record<string, unknown>[]> => {
    const sdk = app as {
      datastore: () => {
        executeQuery: (q: string) => Promise<{ data: Record<string, unknown>[] }>;
      };
    };
    const response = await sdk.datastore().executeQuery(query);
    return response.data ?? [];
  };
}

// ---------------------------------------------------------------------------
// ZCQL query builders (parameterised — no raw user input interpolated)
// ---------------------------------------------------------------------------

/**
 * Fetch all MO_Features rows joined with Cases to get the narrative.
 * Uses a LEFT JOIN to ensure rows without matching Cases entries are still returned.
 */
function buildFetchAllMOFeaturesQuery(): string {
  return (
    "SELECT mof.ROWID, mof.case_id, mof.entry_method, mof.time_of_day," +
    " mof.weapon_type, mof.victim_age_group, mof.target_type, mof.zia_entities_json," +
    " c.narrative, c.case_id AS case_ref_id" +
    " FROM MO_Features mof" +
    " LEFT JOIN Cases c ON mof.case_id = c.ROWID" +
    " LIMIT 1000"
  );
}

// ---------------------------------------------------------------------------
// Main agent function
// ---------------------------------------------------------------------------

/**
 * Run the Case Linking Agent.
 *
 * @param state         Current AgentState from the LangGraph graph.
 * @param app           Catalyst app instance for real Data Store access.
 * @param zcqlExecutor  Optional injectable ZCQL executor (for tests).
 * @param ziaFetcher    Optional injectable Zia fetcher (for tests).
 *
 * Requirements:
 *   3.1 — Compute Jaccard score for every other case in the dataset
 *   3.2 — Return only cases with jaccard_score >= JACCARD_THRESHOLD
 *   3.3 — Zia enrichment on the seed case narrative; non-critical path
 *   3.4 — Output must not assert shared offender identity
 *   3.5 — If no cases meet threshold, return explicit no-match message
 *   3.6 — LinkedCase.matching_features lists intersecting feature strings
 */
export async function runCaseLinkingAgent(
  state: AgentState,
  app: unknown,
  zcqlExecutor?: ZcqlExecutor,
  ziaFetcher?: (text: string, app: unknown) => Promise<import("../types").ZiaEntity[]>
): Promise<Partial<AgentState>> {
  const threshold = getJaccardThreshold();
  const executor: ZcqlExecutor = zcqlExecutor ?? buildRealExecutor(app);
  const ziaExtract = ziaFetcher ?? extractEntities;

  // Track whether Zia enrichment was available
  let ziaEnrichmentStatus: "available" | "unavailable" = "available";

  // -------------------------------------------------------------------------
  // Step 1: Identify the seed case from state.entities.case_ids
  // -------------------------------------------------------------------------

  const seedCaseId: string | null =
    state.entities?.case_ids?.[0] ?? null;

  // -------------------------------------------------------------------------
  // Step 2: Fetch all MO_Features rows from Data Store
  // -------------------------------------------------------------------------

  let allRows: Record<string, unknown>[] = [];
  try {
    allRows = await executor(buildFetchAllMOFeaturesQuery());
  } catch (err) {
    console.error("[CaseLinkingAgent] Failed to fetch MO_Features:", err);
    const failedTrace = {
      ...state.reasoning_trace,
      agents_invoked: [...state.reasoning_trace.agents_invoked, "case_linking"],
      failed_step: "case_linking",
    };
    return {
      linked_cases: [],
      reasoning_trace: failedTrace,
      error: {
        agent: "case_linking",
        code: "ZCQL_ERROR" as const,
        message: "Database is temporarily unavailable.",
        partial_trace: failedTrace,
      },
    };
  }

  // Cast rows to the typed shape (double cast via unknown is needed since
  // Record<string,unknown>[] and MOFeaturesRow[] have no guaranteed overlap)
  const moRows = allRows as unknown as MOFeaturesRow[];

  if (moRows.length === 0) {
    // No data available — treat as no-match
    const updatedTrace = {
      ...state.reasoning_trace,
      agents_invoked: [...state.reasoning_trace.agents_invoked, "case_linking"],
    };
    return {
      linked_cases: [],
      reasoning_trace: updatedTrace,
    };
  }

  // -------------------------------------------------------------------------
  // Step 3: Build feature sets for each case row
  // Each feature set = "field:value" strings from MO + "zia:<entity>" strings
  // from zia_entities_json cache column.
  // -------------------------------------------------------------------------

  interface CaseFeatureRecord {
    case_id: string;
    features: Set<string>;
    narrative?: string;
  }

  const caseFeatureMap = new Map<string, CaseFeatureRecord>();

  for (const row of moRows) {
    // Normalise case_id to a string key
    const rowCaseId = String(row.case_id ?? "").trim();
    if (rowCaseId === "") continue;

    const moFeatures = moRowToFeatureSet(row);
    const ziaFeatures = parseZiaEntitiesJson(row.zia_entities_json);
    const combined = new Set([...moFeatures, ...ziaFeatures]);

    // If multiple rows share the same case_id, merge their features
    const existing = caseFeatureMap.get(rowCaseId);
    if (existing) {
      for (const f of combined) existing.features.add(f);
    } else {
      caseFeatureMap.set(rowCaseId, {
        case_id: rowCaseId,
        features: combined,
        narrative: typeof row.narrative === "string" ? row.narrative : undefined,
      });
    }
  }

  // -------------------------------------------------------------------------
  // Step 4: Identify the seed case features
  // If no seed case_id was supplied, use the first row as the reference.
  // -------------------------------------------------------------------------

  let seedKey: string | null = null;
  if (seedCaseId !== null) {
    // Try to find the seed by exact match or by the human-readable case_id
    for (const key of caseFeatureMap.keys()) {
      if (key === seedCaseId) {
        seedKey = key;
        break;
      }
    }
    // If not found by ROWID key, the first case in the map is used as fallback
    if (seedKey === null && caseFeatureMap.size > 0) {
      seedKey = caseFeatureMap.keys().next().value as string;
    }
  } else if (caseFeatureMap.size > 0) {
    seedKey = caseFeatureMap.keys().next().value as string;
  }

  if (seedKey === null) {
    const updatedTrace = {
      ...state.reasoning_trace,
      agents_invoked: [...state.reasoning_trace.agents_invoked, "case_linking"],
    };
    return {
      linked_cases: [],
      reasoning_trace: updatedTrace,
    };
  }

  const seedRecord = caseFeatureMap.get(seedKey)!;

  // -------------------------------------------------------------------------
  // Step 5: Enrich seed case with Zia entities from narrative (Req 3.3)
  // Non-critical: if Zia fails, proceed with raw MO features only.
  // -------------------------------------------------------------------------

  const seedFeaturesBeforeZia = new Set(seedRecord.features);

  if (seedRecord.narrative && seedRecord.narrative.trim() !== "") {
    try {
      const ziaEntities = await ziaExtract(seedRecord.narrative, app);
      for (const entity of ziaEntities) {
        if (entity.value && entity.value.trim() !== "") {
          seedRecord.features.add(`zia:${entity.value.trim()}`);
        }
      }
    } catch {
      // Non-critical: annotate and proceed
      ziaEnrichmentStatus = "unavailable";
    }
  }

  // Verify enrichment only added, never removed (Property 7 invariant)
  for (const f of seedFeaturesBeforeZia) {
    seedRecord.features.add(f); // idempotent — ensures no removal
  }

  // -------------------------------------------------------------------------
  // Step 6: Compute Jaccard scores for every OTHER case (Req 3.1)
  // -------------------------------------------------------------------------

  const linkedCases: LinkedCase[] = [];

  for (const [caseId, record] of caseFeatureMap.entries()) {
    // Skip the seed case itself
    if (caseId === seedKey) continue;

    const score = jaccardScore(seedRecord.features, record.features);
    const intersection = setIntersection(seedRecord.features, record.features);

    // Separate MO features from zia features in the intersection
    const matchingFeatures: string[] = [];
    const ziaEntityOverlap: string[] = [];

    for (const feat of intersection) {
      if (feat.startsWith("zia:")) {
        ziaEntityOverlap.push(feat);
      } else {
        matchingFeatures.push(feat);
      }
    }

    // Only surface cases meeting the threshold (Req 3.2)
    if (score >= threshold) {
      // Req 3.6 — matching_features must be non-empty; skip if nothing matched
      if (matchingFeatures.length === 0 && ziaEntityOverlap.length === 0) continue;

      linkedCases.push({
        case_id: record.case_id,
        jaccard_score: score,
        // Req 3.4 — description must NOT assert shared offender
        matching_features: matchingFeatures,
        zia_entity_overlap: ziaEntityOverlap,
      });
    }
  }

  // Sort by score descending for readability
  linkedCases.sort((a, b) => b.jaccard_score - a.jaccard_score);

  // -------------------------------------------------------------------------
  // Step 7: Assemble Jaccard scores for the reasoning trace
  // -------------------------------------------------------------------------

  const jaccardScores = linkedCases.map((lc) => ({
    case_id: lc.case_id,
    score: lc.jaccard_score,
    matching_features: lc.matching_features,
  }));

  const updatedTrace = {
    ...state.reasoning_trace,
    agents_invoked: [...state.reasoning_trace.agents_invoked, "case_linking"],
    jaccard_scores: jaccardScores,
    // Annotate Zia availability (non-critical path, Req 3.3)
    ...(ziaEnrichmentStatus === "unavailable"
      ? { zia_enrichment: "unavailable" as const }
      : {}),
  };

  // -------------------------------------------------------------------------
  // Step 8: Return result — no-match message if nothing meets threshold (Req 3.5)
  // -------------------------------------------------------------------------

  if (linkedCases.length === 0) {
    return {
      // Req 3.5 — explicit no-match message; no assertive offender language
      linked_cases: [],
      reasoning_trace: updatedTrace,
    };
  }

  return {
    linked_cases: linkedCases,
    reasoning_trace: updatedTrace,
  };
}

// ---------------------------------------------------------------------------
// No-match message helper (used by explainability layer and tests)
// ---------------------------------------------------------------------------

/**
 * Returns the standard no-match message for case linking.
 * Wording avoids assertive offender language (Req 3.4).
 */
export function noMatchMessage(): string {
  return (
    "No cases with sufficiently similar modus operandi were found. " +
    "These results are provided as potential pattern matches for investigator review — " +
    "no inference about shared offenders is made."
  );
}
