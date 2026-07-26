/**
 * In-memory Catalyst Data Store for local development.
 *
 * Loads the synthetic seed dataset and executes the ZCQL query patterns
 * used by structuredQuery, caseLinking, and networkAnalysis agents.
 */

import {
  CASES,
  LOCATIONS,
  SUSPECTS,
  MO_FEATURES,
} from "../../../../scripts/seed/src/data";

type Row = Record<string, unknown>;

interface LocalDatabase {
  Cases: Row[];
  Locations: Row[];
  Suspects: Row[];
  MO_Features: Row[];
  Audit_Log: Row[];
}

function unquote(value: string): string {
  const trimmed = value.trim();
  if (
    (trimmed.startsWith("'") && trimmed.endsWith("'")) ||
    (trimmed.startsWith('"') && trimmed.endsWith('"'))
  ) {
    return trimmed.slice(1, -1).replace(/''/g, "'");
  }
  return trimmed;
}

function parseWhereConditions(whereClause: string): Array<{ field: string; op: string; value: string }> {
  const conditions: Array<{ field: string; op: string; value: string }> = [];
  const regex = /([\w.]+)\s*(=|>=|<=|LIKE|IN)\s*(?:\(([^)]+)\)|'([^']*(?:''[^']*)*)'|"([^"]*)")/gi;
  let match: RegExpExecArray | null;

  while ((match = regex.exec(whereClause)) !== null) {
    const field = match[1];
    const op = match[2].toUpperCase();
    const rawValue = match[3] ?? match[4] ?? match[5] ?? "";
    conditions.push({ field, op, value: unquote(rawValue) });
  }

  return conditions;
}

function rowMatches(row: Row, alias: string, condition: { field: string; op: string; value: string }): boolean {
  const fieldName = condition.field.includes(".")
    ? condition.field.split(".")[1]
    : condition.field;
  const actual = row[fieldName];
  const actualStr = actual === undefined || actual === null ? "" : String(actual);

  switch (condition.op) {
    case "=":
      return actualStr.toLowerCase() === condition.value.toLowerCase();
    case ">=":
      return actualStr >= condition.value;
    case "<=":
      return actualStr <= condition.value;
    case "LIKE": {
      const pattern = condition.value.replace(/%/g, ".*").replace(/_/g, ".");
      return new RegExp(`^${pattern}$`, "i").test(actualStr);
    }
    case "IN": {
      const values = condition.value
        .split(",")
        .map((part) => unquote(part.trim()).toLowerCase())
        .filter(Boolean);
      return values.includes(actualStr.toLowerCase());
    }
    default:
      return true;
  }
}

function applyWhere(rows: Row[], alias: string, whereClause?: string): Row[] {
  if (!whereClause) return rows;
  const conditions = parseWhereConditions(whereClause);
  if (conditions.length === 0) return rows;

  return rows.filter((row) =>
    conditions.every((condition) => {
      if (condition.field.startsWith(`${alias}.`) || !condition.field.includes(".")) {
        return rowMatches(row, alias, condition);
      }
      return true;
    })
  );
}

function applyLimit(rows: Row[], query: string): Row[] {
  const limitMatch = query.match(/\bLIMIT\s+(\d+)\b/i);
  if (!limitMatch) return rows;
  return rows.slice(0, parseInt(limitMatch[1], 10));
}

function buildDatabase(): LocalDatabase {
  const Cases: Row[] = CASES.map((row, index) => ({
    ROWID: String(index + 1),
    ...row,
    filed_date: row.filed_date.slice(0, 10),
  }));

  const Locations: Row[] = LOCATIONS.map((row, index) => ({
    ROWID: String(index + 1),
    ...row,
  }));

  const Suspects: Row[] = SUSPECTS.map((row, index) => ({
    ROWID: String(index + 1),
    ...row,
  }));

  const MO_Features: Row[] = MO_FEATURES.map((row, index) => ({
    ROWID: String(index + 1),
    ...row,
  }));

  return { Cases, Locations, Suspects, MO_Features, Audit_Log: [] };
}

function extractWhereClause(query: string): string | undefined {
  const match = query.match(/\bWHERE\b([\s\S]*?)(?:\bLIMIT\b|$)/i);
  return match?.[1]?.trim();
}

function executeCasesQuery(db: LocalDatabase, query: string): Row[] {
  const whereClause = extractWhereClause(query);
  let rows = [...db.Cases];

  if (whereClause?.includes("location_id IN (SELECT ROWID FROM Locations")) {
    const locationLiterals = [...whereClause.matchAll(/'([^']*(?:''[^']*)*)'/g)].map((m) =>
      unquote(`'${m[1]}'`)
    );
    const matchingLocationIds = db.Locations.filter(
      (loc) =>
        locationLiterals.some(
          (literal) =>
            String(loc.district).toLowerCase() === literal.toLowerCase() ||
            String(loc.village_or_area).toLowerCase() === literal.toLowerCase()
        )
    ).map((loc) => String(loc.location_id));

    rows = rows.filter((row) => matchingLocationIds.includes(String(row.location_id)));
  } else if (whereClause?.includes("ROWID IN (SELECT case_id FROM MO_Features")) {
    const moConditions = parseWhereConditions(whereClause);
    const moRows = applyWhere(db.MO_Features, "mof", whereClause.split("MO_Features WHERE")[1]);
    const caseIds = new Set(moRows.map((row) => String(row.case_id)));
    rows = rows.filter((row) => caseIds.has(String(row.case_id)));
  } else {
    rows = applyWhere(rows, "c", whereClause);
  }

  return applyLimit(rows, query);
}

function executeCasesMoJoinQuery(db: LocalDatabase, query: string): Row[] {
  const whereClause = extractWhereClause(query);
  const joined: Row[] = [];

  for (const caseRow of db.Cases) {
    const moRow = db.MO_Features.find((row) => row.case_id === caseRow.case_id);
    if (!moRow) continue;

    const merged: Row = {
      ROWID: caseRow.ROWID,
      case_id: caseRow.case_id,
      title: caseRow.title,
      crime_type: caseRow.crime_type,
      status: caseRow.status,
      filed_date: caseRow.filed_date,
      entry_method: moRow.entry_method,
      time_of_day: moRow.time_of_day,
      weapon_type: moRow.weapon_type,
      victim_age_group: moRow.victim_age_group,
      target_type: moRow.target_type,
    };

    joined.push(merged);
  }

  let rows = joined;
  if (whereClause) {
    rows = joined.filter((row) => {
      const conditions = parseWhereConditions(whereClause);
      return conditions.every((condition) => {
        const fieldName = condition.field.includes(".")
          ? condition.field.split(".")[1]
          : condition.field;
        return rowMatches(row, "c", { ...condition, field: fieldName });
      });
    });
  }

  return applyLimit(rows, query);
}

function executeMoFeaturesJoinQuery(db: LocalDatabase, query: string): Row[] {
  const rows = db.MO_Features.map((moRow) => {
    const caseRow = db.Cases.find((row) => row.case_id === moRow.case_id);
    return {
      ROWID: moRow.ROWID,
      case_id: moRow.case_id,
      entry_method: moRow.entry_method,
      time_of_day: moRow.time_of_day,
      weapon_type: moRow.weapon_type,
      victim_age_group: moRow.victim_age_group,
      target_type: moRow.target_type,
      zia_entities_json: moRow.zia_entities_json,
      narrative: caseRow?.narrative ?? "",
      case_ref_id: caseRow?.case_id ?? moRow.case_id,
    };
  });

  return applyLimit(rows, query);
}

function executeSuspectsQuery(db: LocalDatabase, query: string): Row[] {
  const whereClause = extractWhereClause(query);
  let rows = [...db.Suspects];

  if (whereClause) {
    const conditions = parseWhereConditions(whereClause);
    rows = rows.filter((row) =>
      conditions.some((condition) => rowMatches(row, "s", condition))
    );
  }

  return applyLimit(rows, query);
}

function executeLocationsQuery(db: LocalDatabase, query: string): Row[] {
  const whereClause = extractWhereClause(query);
  let rows = [...db.Locations];

  if (whereClause) {
    const conditions = parseWhereConditions(whereClause);
    rows = rows.filter((row) =>
      conditions.some((condition) => rowMatches(row, "l", condition))
    );
  }

  return applyLimit(rows, query);
}

function executeLocalQuery(db: LocalDatabase, query: string): Row[] {
  const normalized = query.replace(/\s+/g, " ").trim();

  if (/INSERT\s+INTO\s+Audit_Log/i.test(normalized)) {
    return [];
  }

  if (/FROM\s+MO_Features\s+mof/i.test(normalized)) {
    return executeMoFeaturesJoinQuery(db, normalized);
  }

  if (/FROM\s+Cases\s+c\s+JOIN\s+MO_Features/i.test(normalized)) {
    return executeCasesMoJoinQuery(db, normalized);
  }

  if (/FROM\s+Suspects/i.test(normalized)) {
    return executeSuspectsQuery(db, normalized);
  }

  if (/FROM\s+Locations/i.test(normalized)) {
    return executeLocationsQuery(db, normalized);
  }

  if (/FROM\s+Cases/i.test(normalized)) {
    return executeCasesQuery(db, normalized);
  }

  return [];
}

export type LocalZcqlExecutor = (query: string) => Promise<Record<string, unknown>[]>;

let sharedDb: LocalDatabase | null = null;

export function getSharedDatabase(): LocalDatabase {
  if (!sharedDb) {
    sharedDb = buildDatabase();
  }
  return sharedDb;
}

export function addCaseToLocalStore(
  caseData: {
    case_id: string;
    title: string;
    crime_type: string;
    status: string;
    filed_date: string;
    location_id: string;
    narrative: string;
  },
  moData: {
    case_id: string;
    entry_method: string;
    time_of_day: string;
    weapon_type: string;
    victim_age_group: string;
    target_type: string;
    zia_entities_json?: string;
  },
  suspectName?: string,
  locationData?: {
    location_id: string;
    district: string;
    taluk: string;
    village_or_area: string;
    latitude: number;
    longitude: number;
  }
) {
  const db = getSharedDatabase();

  // If new location provided, add if not existing
  if (locationData && !db.Locations.some((l) => l.location_id === locationData.location_id)) {
    db.Locations.push({
      ROWID: String(db.Locations.length + 1),
      ...locationData,
    });
  }

  // Add Case
  const caseRow = {
    ROWID: String(db.Cases.length + 1),
    ...caseData,
    filed_date: caseData.filed_date.slice(0, 10),
  };
  db.Cases.unshift(caseRow);

  // Add MO Feature
  const moRow = {
    ROWID: String(db.MO_Features.length + 1),
    zia_entities_json: "{}",
    ...moData,
  };
  db.MO_Features.unshift(moRow);

  // Add Suspect if provided
  if (suspectName) {
    db.Suspects.push({
      ROWID: String(db.Suspects.length + 1),
      suspect_id: `SUS-${Date.now()}`,
      name: suspectName,
      age: 30,
      known_associates: "None",
      case_ids: caseData.case_id,
    });
  }

  return { caseRow, moRow };
}

export interface EnrichedCaseItem {
  case_id: string;
  title: string;
  crime_type: string;
  status: string;
  filed_date: string;
  narrative: string;
  location_id: string;
  location: {
    location_id: string;
    district: string;
    taluk: string;
    village_or_area: string;
    latitude: number;
    longitude: number;
  };
  mo_features: {
    case_id: string;
    entry_method: string;
    time_of_day: string;
    weapon_type: string;
    victim_age_group: string;
    target_type: string;
    zia_entities_json?: string;
  };
  suspects: string[];
}

export function getAllCasesEnriched(): EnrichedCaseItem[] {
  const db = getSharedDatabase();

  return db.Cases.map((c) => {
    const loc = db.Locations.find((l) => l.location_id === c.location_id) || {
      location_id: "LOC-001",
      district: "Bengaluru Urban",
      taluk: "Bengaluru North",
      village_or_area: "Central Headquarters",
      latitude: 12.9716,
      longitude: 77.5946,
    };

    const mo = db.MO_Features.find((m) => m.case_id === c.case_id) || {
      case_id: String(c.case_id),
      entry_method: "unknown",
      time_of_day: "unknown",
      weapon_type: "none",
      victim_age_group: "adult",
      target_type: "residential",
      zia_entities_json: "{}",
    };

    const suspects = db.Suspects.filter((s) =>
      String(s.case_ids || "").includes(String(c.case_id))
    );

    return {
      case_id: String(c.case_id || ""),
      title: String(c.title || ""),
      crime_type: String(c.crime_type || ""),
      status: String(c.status || "open"),
      filed_date: String(c.filed_date || ""),
      narrative: String(c.narrative || ""),
      location_id: String(c.location_id || ""),
      location: {
        location_id: String(loc.location_id || ""),
        district: String(loc.district || ""),
        taluk: String(loc.taluk || ""),
        village_or_area: String(loc.village_or_area || ""),
        latitude: Number(loc.latitude || 12.9716),
        longitude: Number(loc.longitude || 77.5946),
      },
      mo_features: {
        case_id: String(mo.case_id || ""),
        entry_method: String(mo.entry_method || "unknown"),
        time_of_day: String(mo.time_of_day || "unknown"),
        weapon_type: String(mo.weapon_type || "none"),
        victim_age_group: String(mo.victim_age_group || "adult"),
        target_type: String(mo.target_type || "residential"),
        zia_entities_json: String(mo.zia_entities_json || "{}"),
      },
      suspects: suspects.map((s) => String(s.name)),
    };
  });
}

export function createLocalZcqlExecutor(): LocalZcqlExecutor {
  const db = getSharedDatabase();
  return async (query: string) => executeLocalQuery(db, query);
}

export function createLocalCatalystApp(): {
  datastore: () => { executeQuery: (query: string) => Promise<{ data: Record<string, unknown>[] }> };
} {
  const executor = createLocalZcqlExecutor();
  return {
    datastore: () => ({
      executeQuery: async (query: string) => ({ data: await executor(query) }),
    }),
  };
}
