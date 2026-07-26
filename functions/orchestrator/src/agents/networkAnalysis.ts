/**
 * Network Analysis Agent
 *
 * Executes multi-hop ZCQL joins across `Suspects`, `Cases`, `Locations` tables.
 * Assigns `hop_distance` to each discovered entity (0 = seed, 1 = direct link,
 * 2 = one-hop away). Paginates at 100 entities sorted by `hop_distance` ascending.
 * Appends the traversal path to `AgentState.reasoning_trace`.
 *
 * Requirements: 7.1, 7.2, 7.3, 7.4
 */

import type {
  AgentState,
  NetworkResult,
  NetworkEntity,
  NetworkEdge,
  ExtractedEntities,
} from "../types";
import { createLocalZcqlExecutor } from "../dev/localStore";

// ---------------------------------------------------------------------------
// ZCQL executor type — injectable for testing (mirrors structuredQuery.ts)
// ---------------------------------------------------------------------------

export type ZcqlExecutor = (query: string) => Promise<Record<string, unknown>[]>;

// ---------------------------------------------------------------------------
// Pagination constant (Requirement 7.4)
// ---------------------------------------------------------------------------

export const NETWORK_PAGE_SIZE = 100;

// ---------------------------------------------------------------------------
// ZCQL escape helper (re-used from structuredQuery pattern)
// ---------------------------------------------------------------------------

/**
 * Escapes a string value for safe ZCQL inclusion.
 * Wraps in single quotes; doubles internal single quotes.
 */
function escapeZcqlString(value: string): string {
  return `'${value.replace(/'/g, "''")}'`;
}

// ---------------------------------------------------------------------------
// Seed entity resolution
// ---------------------------------------------------------------------------

/**
 * Convert `ExtractedEntities` into zero-hop (seed) NetworkEntity objects.
 * Suspects come from `suspect_names`, cases from `case_ids`,
 * locations from `locations`.
 */
function buildSeedEntities(entities: ExtractedEntities): NetworkEntity[] {
  const seeds: NetworkEntity[] = [];

  for (const name of entities.suspect_names) {
    seeds.push({ id: name, type: "suspect", label: name, hop_distance: 0 });
  }
  for (const caseId of entities.case_ids) {
    seeds.push({ id: caseId, type: "case", label: caseId, hop_distance: 0 });
  }
  for (const loc of entities.locations) {
    seeds.push({ id: loc, type: "location", label: loc, hop_distance: 0 });
  }

  return seeds;
}

// ---------------------------------------------------------------------------
// Hop-1: direct connections from seed entities
// ---------------------------------------------------------------------------

/**
 * Given a suspect name, fetch the cases that suspect is linked to and return
 * new NetworkEntity objects (hop_distance = 1) plus edges.
 */
async function fetchCasesForSuspect(
  suspectId: string,
  executor: ZcqlExecutor,
  edgesOut: NetworkEdge[]
): Promise<NetworkEntity[]> {
  // Suspect rows carry a `case_ids` JSON string — we fetch the suspect row and
  // extract case_id values.  Because ZCQL lacks JSON functions, we rely on the
  // suspect_id / name stored in `case_ids` as a string containing the case IDs.
  const query =
    `SELECT ROWID, suspect_id, name, case_ids FROM Suspects ` +
    `WHERE name = ${escapeZcqlString(suspectId)} ` +
    `OR suspect_id = ${escapeZcqlString(suspectId)}`;

  const rows = await executor(query);
  const entities: NetworkEntity[] = [];

  for (const row of rows) {
    // case_ids is stored as a JSON array string, e.g. '["KSP-2024-001","KSP-2024-002"]'
    const rawCaseIds = parseCsvOrJson(row["case_ids"]);
    for (const caseId of rawCaseIds) {
      const entity: NetworkEntity = {
        id: caseId,
        type: "case",
        label: caseId,
        hop_distance: 1,
      };
      entities.push(entity);
      edgesOut.push({
        from_id: suspectId,
        to_id: caseId,
        relationship: "involved_in",
      });
    }
  }

  return entities;
}

/**
 * Given a case ID, fetch linked suspects and the location for that case.
 */
async function fetchEntitiesForCase(
  caseId: string,
  hopDistance: number,
  executor: ZcqlExecutor,
  edgesOut: NetworkEdge[]
): Promise<NetworkEntity[]> {
  const entities: NetworkEntity[] = [];

  // Suspects linked to this case
  const suspectQuery =
    `SELECT ROWID, suspect_id, name FROM Suspects ` +
    `WHERE case_ids LIKE ${escapeZcqlString(`%${caseId}%`)}`;

  const suspectRows = await executor(suspectQuery);
  for (const row of suspectRows) {
    const id = stringVal(row["suspect_id"]) || stringVal(row["name"]);
    const label = stringVal(row["name"]) || id;
    if (!id) continue;
    entities.push({ id, type: "suspect", label, hop_distance: hopDistance });
    edgesOut.push({ from_id: caseId, to_id: id, relationship: "has_suspect" });
  }

  // Location for this case
  const caseQuery =
    `SELECT ROWID, case_id, title, location_id FROM Cases ` +
    `WHERE case_id = ${escapeZcqlString(caseId)}`;

  const caseRows = await executor(caseQuery);
  for (const row of caseRows) {
    const locationId = stringVal(row["location_id"]);
    if (!locationId) continue;
    // Resolve the location name
    const locQuery =
      `SELECT ROWID, location_id, district, village_or_area FROM Locations ` +
      `WHERE ROWID = ${escapeZcqlString(locationId)} ` +
      `OR location_id = ${escapeZcqlString(locationId)}`;
    const locRows = await executor(locQuery);
    for (const locRow of locRows) {
      const locId =
        stringVal(locRow["location_id"]) || stringVal(locRow["ROWID"]);
      const label =
        stringVal(locRow["village_or_area"]) ||
        stringVal(locRow["district"]) ||
        locId;
      if (!locId) continue;
      entities.push({
        id: locId,
        type: "location",
        label,
        hop_distance: hopDistance,
      });
      edgesOut.push({
        from_id: caseId,
        to_id: locId,
        relationship: "occurred_at",
      });
    }
  }

  return entities;
}

/**
 * Given a location ID or name, fetch cases that occurred there.
 */
async function fetchCasesForLocation(
  locationId: string,
  hopDistance: number,
  executor: ZcqlExecutor,
  edgesOut: NetworkEdge[]
): Promise<NetworkEntity[]> {
  const entities: NetworkEntity[] = [];

  // First resolve the ROWID of the location
  const locQuery =
    `SELECT ROWID, location_id FROM Locations ` +
    `WHERE location_id = ${escapeZcqlString(locationId)} ` +
    `OR district = ${escapeZcqlString(locationId)} ` +
    `OR village_or_area = ${escapeZcqlString(locationId)}`;

  const locRows = await executor(locQuery);

  for (const locRow of locRows) {
    const rowid = stringVal(locRow["ROWID"]);
    if (!rowid) continue;

    const caseQuery =
      `SELECT ROWID, case_id, title FROM Cases ` +
      `WHERE location_id = ${escapeZcqlString(rowid)}`;

    const caseRows = await executor(caseQuery);
    for (const row of caseRows) {
      const caseId = stringVal(row["case_id"]);
      if (!caseId) continue;
      entities.push({
        id: caseId,
        type: "case",
        label: stringVal(row["title"]) || caseId,
        hop_distance: hopDistance,
      });
      edgesOut.push({
        from_id: locationId,
        to_id: caseId,
        relationship: "has_case",
      });
    }
  }

  return entities;
}

// ---------------------------------------------------------------------------
// Multi-hop traversal
// ---------------------------------------------------------------------------

/**
 * Perform up to 2 hops of graph traversal starting from the seed entities.
 *
 * Returns all discovered entities (including seeds) with correct `hop_distance`
 * values, de-duplicated by (id, type) pair.
 *
 * Tables accessed: Suspects, Cases, Locations (Requirement 7.1)
 */
async function traverseNetwork(
  seeds: NetworkEntity[],
  executor: ZcqlExecutor
): Promise<{ entities: NetworkEntity[]; edges: NetworkEdge[] }> {
  const edges: NetworkEdge[] = [];
  // Map: "${type}:${id}" → NetworkEntity  (lowest hop_distance wins)
  const entityMap = new Map<string, NetworkEntity>();

  function addEntity(entity: NetworkEntity): void {
    const key = `${entity.type}:${entity.id}`;
    const existing = entityMap.get(key);
    if (!existing || entity.hop_distance < existing.hop_distance) {
      entityMap.set(key, entity);
    }
  }

  for (const seed of seeds) {
    addEntity(seed);
  }

  // Hop 1: expand each seed
  const hop1Entities: NetworkEntity[] = [];

  for (const seed of seeds) {
    let discovered: NetworkEntity[] = [];

    if (seed.type === "suspect") {
      discovered = await fetchCasesForSuspect(seed.id, executor, edges);
    } else if (seed.type === "case") {
      discovered = await fetchEntitiesForCase(seed.id, 1, executor, edges);
    } else if (seed.type === "location") {
      discovered = await fetchCasesForLocation(seed.id, 1, executor, edges);
    }

    for (const e of discovered) {
      addEntity(e);
      hop1Entities.push(e);
    }
  }

  // Hop 2: expand hop-1 entities that weren't already seeds
  const seedKeys = new Set(seeds.map((s) => `${s.type}:${s.id}`));

  for (const hop1 of hop1Entities) {
    const key = `${hop1.type}:${hop1.id}`;
    if (seedKeys.has(key)) continue; // already covered at hop 0

    let discovered: NetworkEntity[] = [];

    if (hop1.type === "suspect") {
      discovered = await fetchCasesForSuspect(hop1.id, executor, edges);
    } else if (hop1.type === "case") {
      discovered = await fetchEntitiesForCase(hop1.id, 2, executor, edges);
    } else if (hop1.type === "location") {
      discovered = await fetchCasesForLocation(hop1.id, 2, executor, edges);
    }

    for (const e of discovered) {
      addEntity(e);
    }
  }

  return {
    entities: Array.from(entityMap.values()),
    edges,
  };
}

// ---------------------------------------------------------------------------
// Pagination and sorting (Requirement 7.4)
// ---------------------------------------------------------------------------

/**
 * Sort entities by `hop_distance` ascending, then paginate at `NETWORK_PAGE_SIZE`.
 */
function paginateEntities(entities: NetworkEntity[]): {
  page: NetworkEntity[];
  paginated: boolean;
  total_count: number;
} {
  const sorted = [...entities].sort(
    (a, b) => a.hop_distance - b.hop_distance
  );
  const total_count = sorted.length;
  const paginated = total_count > NETWORK_PAGE_SIZE;
  const page = paginated ? sorted.slice(0, NETWORK_PAGE_SIZE) : sorted;
  return { page, paginated, total_count };
}

// ---------------------------------------------------------------------------
// Real Catalyst SDK executor factory (mirrors structuredQuery.ts)
// ---------------------------------------------------------------------------

function buildRealExecutor(app: unknown): ZcqlExecutor {
  if (!app || typeof (app as Record<string, unknown>).datastore !== "function") {
    return createLocalZcqlExecutor();
  }
  return async (query: string): Promise<Record<string, unknown>[]> => {
    const sdk = app as {
      datastore: () => {
        executeQuery: (
          q: string
        ) => Promise<{ data: Record<string, unknown>[] }>;
      };
    };
    const response = await sdk.datastore().executeQuery(query);
    return response.data ?? [];
  };
}

// ---------------------------------------------------------------------------
// Main export
// ---------------------------------------------------------------------------

/**
 * Run the Network Analysis Agent.
 *
 * @param state          Current AgentState from the LangGraph graph.
 * @param app            Catalyst app instance (real executor).
 * @param zcqlExecutor   Optional executor override — inject a mock for tests.
 *
 * Requirements:
 *   7.1 — Execute relational ZCQL across Suspects, Cases, Locations
 *   7.2 — Return degree of connection (hop_distance) for each entity
 *   7.3 — Include result in ReasoningTrace (traversal_path = edges)
 *   7.4 — Paginate at 100 entities; set paginated + total_count when exceeded
 */
export async function runNetworkAnalysisAgent(
  state: AgentState,
  app: unknown,
  zcqlExecutor?: ZcqlExecutor
): Promise<Partial<AgentState>> {
  const executor: ZcqlExecutor = zcqlExecutor ?? buildRealExecutor(app);

  const entities = state.entities ?? {
    suspect_names: [],
    case_ids: [],
    locations: [],
    crime_types: [],
    mo_features: {},
  };

  // Build seed (hop-0) entities from state
  const seeds = buildSeedEntities(entities);

  let networkResult: NetworkResult;

  try {
    const { entities: allEntities, edges } =
      seeds.length > 0
        ? await traverseNetwork(seeds, executor)
        : { entities: [], edges: [] };

    const { page, paginated, total_count } = paginateEntities(allEntities);

    networkResult = {
      entities: page,
      edges,
      paginated,
      total_count,
    };
  } catch (err) {
    console.error("[NetworkAnalysisAgent] ZCQL execution error:", err);
    networkResult = {
      entities: seeds,
      edges: [],
      paginated: false,
      total_count: seeds.length,
    };
  }

  // Append to reasoning trace (Requirement 7.3)
  const updatedTrace = {
    ...state.reasoning_trace,
    agents_invoked: [
      ...state.reasoning_trace.agents_invoked,
      "network_analysis",
    ],
    traversal_path: networkResult.edges,
    // Record the three tables accessed (Requirements 7.1, Property 18)
    zcql_filters: [
      ...state.reasoning_trace.zcql_filters,
      "tables: Suspects, Cases, Locations",
    ],
  };

  return {
    network_results: networkResult,
    reasoning_trace: updatedTrace,
  };
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

/** Safely coerce a record value to a string. */
function stringVal(v: unknown): string {
  if (v === null || v === undefined) return "";
  return String(v);
}

/**
 * Parse a value that may be:
 *  - a JSON array string: '["id1","id2"]'
 *  - a comma-separated string: "id1,id2"
 *  - already an array
 *  - a plain string (single value)
 */
function parseCsvOrJson(v: unknown): string[] {
  if (Array.isArray(v)) return v.map(String);
  if (typeof v !== "string" || !v.trim()) return [];
  const trimmed = v.trim();
  if (trimmed.startsWith("[")) {
    try {
      const parsed = JSON.parse(trimmed);
      if (Array.isArray(parsed)) return parsed.map(String);
    } catch {
      // fall through
    }
  }
  // Comma-separated fallback
  return trimmed
    .split(",")
    .map((s) => s.trim().replace(/^["']|["']$/g, ""))
    .filter(Boolean);
}
