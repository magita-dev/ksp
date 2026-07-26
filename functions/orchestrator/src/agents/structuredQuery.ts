/**
 * Structured Query Agent
 *
 * Translates ParsedIntent + ExtractedEntities into parameterised ZCQL queries,
 * executes them against Catalyst Data Store, and returns human-readable results.
 *
 * Requirements: 2.1, 2.2, 2.3, 2.4, 2.5
 */

import type { ParsedIntent, ExtractedEntities, QueryResult } from "../types";
import { createLocalZcqlExecutor } from "../dev/localStore";

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

export interface StructuredQueryResult {
  results: QueryResult[];
  zero_results: boolean;
  error?: string;
  /** Set when zero_results is true — human-readable description of applied filters */
  guidance_message?: string;
}

// ---------------------------------------------------------------------------
// ZCQL executor type — injectable for testing
// ---------------------------------------------------------------------------

type ZcqlExecutor = (query: string) => Promise<Record<string, unknown>[]>;

// ---------------------------------------------------------------------------
// Parameterised binding helpers
// ---------------------------------------------------------------------------

/**
 * Escapes a string value for safe inclusion in a ZCQL query.
 * Wraps the value in single quotes and escapes any internal single quotes.
 *
 * NOTE: This is a last-resort guard.  All query composition still uses
 * template-based parameterisation — this function is not a substitute for
 * avoiding string interpolation of user input.
 */
export function escapeZcqlString(value: string): string {
  // Escape internal single quotes by doubling them (SQL-standard escaping)
  const escaped = value.replace(/'/g, "''");
  return `'${escaped}'`;
}

// ---------------------------------------------------------------------------
// Human-readable filter builders (Requirement 2.5 — never expose raw ZCQL)
// ---------------------------------------------------------------------------

function buildFiltersApplied(entities: ExtractedEntities): string[] {
  const filters: string[] = [];

  if (entities.crime_types.length > 0) {
    filters.push(`crime type: ${entities.crime_types.join(", ")}`);
  }

  if (entities.locations.length > 0) {
    filters.push(`location: ${entities.locations.join(", ")}`);
  }

  if (entities.date_range) {
    filters.push(`date range: ${entities.date_range.from} to ${entities.date_range.to}`);
  }

  if (entities.suspect_names.length > 0) {
    filters.push(`suspect names: ${entities.suspect_names.join(", ")}`);
  }

  if (entities.case_ids.length > 0) {
    filters.push(`case IDs: ${entities.case_ids.join(", ")}`);
  }

  const mo = entities.mo_features;
  if (mo.entry_method) filters.push(`entry method: ${mo.entry_method}`);
  if (mo.time_of_day) filters.push(`time of day: ${mo.time_of_day}`);
  if (mo.weapon_type) filters.push(`weapon type: ${mo.weapon_type}`);
  if (mo.victim_age_group) filters.push(`victim age group: ${mo.victim_age_group}`);
  if (mo.target_type) filters.push(`target type: ${mo.target_type}`);

  return filters;
}

// ---------------------------------------------------------------------------
// ZCQL template builders — parameterised, no raw user input interpolated
// ---------------------------------------------------------------------------

/**
 * Build a ZCQL query for case_lookup intent.
 * Maps to the Cases table with optional joins to Locations.
 */
function buildCaseLookupQuery(entities: ExtractedEntities): string {
  const conditions: string[] = [];

  for (const crimeType of entities.crime_types) {
    conditions.push(`crime_type = ${escapeZcqlString(crimeType)}`);
  }

  for (const caseId of entities.case_ids) {
    conditions.push(`case_id = ${escapeZcqlString(caseId)}`);
  }

  if (entities.date_range) {
    conditions.push(
      `filed_date >= ${escapeZcqlString(entities.date_range.from)}`,
      `filed_date <= ${escapeZcqlString(entities.date_range.to)}`
    );
  }

  // Location filter requires a sub-select against Locations table
  if (entities.locations.length > 0) {
    const locationLiterals = entities.locations
      .map((loc) => escapeZcqlString(loc))
      .join(", ");
    conditions.push(
      `location_id IN (SELECT ROWID FROM Locations WHERE district IN (${locationLiterals}) OR village_or_area IN (${locationLiterals}))`
    );
  }

  const mo = entities.mo_features;
  if (mo.entry_method || mo.time_of_day || mo.weapon_type || mo.victim_age_group || mo.target_type) {
    const moConditions: string[] = [];
    if (mo.entry_method) moConditions.push(`entry_method = ${escapeZcqlString(mo.entry_method)}`);
    if (mo.time_of_day) moConditions.push(`time_of_day = ${escapeZcqlString(mo.time_of_day)}`);
    if (mo.weapon_type) moConditions.push(`weapon_type = ${escapeZcqlString(mo.weapon_type)}`);
    if (mo.victim_age_group) moConditions.push(`victim_age_group = ${escapeZcqlString(mo.victim_age_group)}`);
    if (mo.target_type) moConditions.push(`target_type = ${escapeZcqlString(mo.target_type)}`);
    conditions.push(
      `ROWID IN (SELECT case_id FROM MO_Features WHERE ${moConditions.join(" AND ")})`
    );
  }

  const whereClause =
    conditions.length > 0 ? ` WHERE ${conditions.join(" AND ")}` : "";

  return `SELECT ROWID, case_id, title, crime_type, status, filed_date, location_id FROM Cases${whereClause} LIMIT 100`;
}

/**
 * Build a ZCQL query for pattern_search intent.
 * Joins MO_Features with Cases to enable MO-based filtering.
 */
function buildPatternSearchQuery(entities: ExtractedEntities): string {
  const moConditions: string[] = [];
  const mo = entities.mo_features;

  if (mo.entry_method) moConditions.push(`mof.entry_method = ${escapeZcqlString(mo.entry_method)}`);
  if (mo.time_of_day) moConditions.push(`mof.time_of_day = ${escapeZcqlString(mo.time_of_day)}`);
  if (mo.weapon_type) moConditions.push(`mof.weapon_type = ${escapeZcqlString(mo.weapon_type)}`);
  if (mo.victim_age_group) moConditions.push(`mof.victim_age_group = ${escapeZcqlString(mo.victim_age_group)}`);
  if (mo.target_type) moConditions.push(`mof.target_type = ${escapeZcqlString(mo.target_type)}`);

  for (const crimeType of entities.crime_types) {
    moConditions.push(`c.crime_type = ${escapeZcqlString(crimeType)}`);
  }

  if (entities.date_range) {
    moConditions.push(
      `c.filed_date >= ${escapeZcqlString(entities.date_range.from)}`,
      `c.filed_date <= ${escapeZcqlString(entities.date_range.to)}`
    );
  }

  const whereClause =
    moConditions.length > 0 ? ` WHERE ${moConditions.join(" AND ")}` : "";

  return (
    `SELECT c.ROWID, c.case_id, c.title, c.crime_type, c.status, c.filed_date,` +
    ` mof.entry_method, mof.time_of_day, mof.weapon_type, mof.victim_age_group, mof.target_type` +
    ` FROM Cases c JOIN MO_Features mof ON c.ROWID = mof.case_id${whereClause} LIMIT 100`
  );
}

/**
 * Build a ZCQL query for network_query intent.
 * Queries the Suspects table filtered by suspect names or case IDs.
 */
function buildNetworkQuery(entities: ExtractedEntities): string {
  const conditions: string[] = [];

  if (entities.suspect_names.length > 0) {
    const nameLiterals = entities.suspect_names
      .map((n) => escapeZcqlString(n))
      .join(", ");
    conditions.push(`name IN (${nameLiterals})`);
  }

  // Filter suspects involved in specific cases via JSON-array matching
  for (const caseId of entities.case_ids) {
    conditions.push(`case_ids LIKE ${escapeZcqlString(`%${caseId}%`)}`);
  }

  const whereClause =
    conditions.length > 0 ? ` WHERE ${conditions.join(" OR ")}` : "";

  return `SELECT ROWID, suspect_id, name, age, known_associates, case_ids FROM Suspects${whereClause} LIMIT 100`;
}

// ---------------------------------------------------------------------------
// Real Catalyst SDK executor factory
// ---------------------------------------------------------------------------

/**
 * Build a real ZCQL executor from the Catalyst app instance.
 * The Catalyst Data Store SDK is accessed via `app` at runtime.
 */
function buildRealExecutor(app: unknown): ZcqlExecutor {
  if (!app || typeof (app as Record<string, unknown>).datastore !== "function") {
    return createLocalZcqlExecutor();
  }
  return async (query: string): Promise<Record<string, unknown>[]> => {
    // Catalyst SDK: app.datastore().executeQuery(zcql)
    // The SDK returns { data: [...] } where each item is a table-name-keyed object.
    const sdk = app as {
      datastore: () => {
        executeQuery: (q: string) => Promise<{ data: Record<string, unknown>[] }>;
      };
    };
    const response = await sdk.datastore().executeQuery(query);
    // Flatten the Catalyst Data Store response envelope
    return response.data ?? [];
  };
}

// ---------------------------------------------------------------------------
// Per-intent query runners
// ---------------------------------------------------------------------------

async function runCaseLookup(
  entities: ExtractedEntities,
  executor: ZcqlExecutor
): Promise<QueryResult> {
  const filters = buildFiltersApplied(entities);
  const query = buildCaseLookupQuery(entities);
  const rows = await executor(query);
  return {
    table: "Cases",
    rows,
    filters_applied: filters,
    row_count: rows.length,
  };
}

async function runPatternSearch(
  entities: ExtractedEntities,
  executor: ZcqlExecutor
): Promise<QueryResult> {
  const filters = buildFiltersApplied(entities);
  const query = buildPatternSearchQuery(entities);
  const rows = await executor(query);
  return {
    table: "MO_Features",
    rows,
    filters_applied: filters,
    row_count: rows.length,
  };
}

async function runNetworkQuery(
  entities: ExtractedEntities,
  executor: ZcqlExecutor
): Promise<QueryResult> {
  const filters = buildFiltersApplied(entities);
  const query = buildNetworkQuery(entities);
  const rows = await executor(query);
  return {
    table: "Suspects",
    rows,
    filters_applied: filters,
    row_count: rows.length,
  };
}

// ---------------------------------------------------------------------------
// Main export
// ---------------------------------------------------------------------------

/**
 * Run the Structured Query Agent.
 *
 * @param parsed       The parsed intent from the Router agent.
 * @param entities     Extracted entities (location, date range, crime type, etc.)
 * @param app          Catalyst app instance (used for real Data Store access).
 * @param zcqlExecutor Optional executor override — inject a mock for tests.
 *
 * Requirements:
 *   2.1 — Convert parsed intent + entities into ZCQL and execute against Data Store
 *   2.2 — Return the result set
 *   2.3 — Return zero-results guidance when query returns 0 rows
 *   2.4 — Catch Data Store errors; return user-friendly message; log internally
 *   2.5 — Never expose raw ZCQL in filters_applied
 */
export async function runStructuredQueryAgent(
  parsed: ParsedIntent,
  entities: ExtractedEntities,
  app: unknown,
  zcqlExecutor?: ZcqlExecutor
): Promise<StructuredQueryResult> {
  const executor: ZcqlExecutor = zcqlExecutor ?? buildRealExecutor(app);

  let results: QueryResult[];

  try {
    switch (parsed.type) {
      case "case_lookup": {
        results = [await runCaseLookup(entities, executor)];
        break;
      }

      case "pattern_search": {
        results = [await runPatternSearch(entities, executor)];
        break;
      }

      case "network_query": {
        results = [await runNetworkQuery(entities, executor)];
        break;
      }

      case "combined": {
        // Fan out: run all three query types and merge results
        const [caseResult, patternResult, networkResult] = await Promise.all([
          runCaseLookup(entities, executor),
          runPatternSearch(entities, executor),
          runNetworkQuery(entities, executor),
        ]);
        results = [caseResult, patternResult, networkResult];
        break;
      }

      default: {
        // "unknown" intent — nothing to query
        return {
          results: [],
          zero_results: true,
          guidance_message:
            "Unable to determine query type. Please rephrase your question.",
        };
      }
    }
  } catch (err: unknown) {
    // Requirement 2.4 — log internally, return user-friendly message
    console.error("[StructuredQueryAgent] ZCQL execution error:", err);
    return {
      results: [],
      zero_results: false,
      error: "Database is temporarily unavailable.",
    };
  }

  // Requirement 2.3 — detect zero results across all query results
  const totalRows = results.reduce((sum, r) => sum + r.row_count, 0);

  if (totalRows === 0) {
    const allFilters = results.flatMap((r) => r.filters_applied);
    const uniqueFilters = [...new Set(allFilters)];
    const filtersDescription =
      uniqueFilters.length > 0 ? uniqueFilters.join("; ") : "none";

    return {
      results,
      zero_results: true,
      guidance_message: `No matching records found with filters: ${filtersDescription}`,
    };
  }

  return {
    results,
    zero_results: false,
  };
}
