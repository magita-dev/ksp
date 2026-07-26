/**
 * Seed script for KSP Crime AI — inserts synthetic rows into Catalyst Data Store.
 *
 * Insertion order: Locations → Cases → Suspects → Victims → MO_Features
 * (Audit_Log is runtime-only and is skipped here.)
 *
 * Idempotency: before inserting a row, the script checks whether a record with
 * the same unique ID already exists (using ZCQL). If it does, the row is
 * skipped. This makes the script safe to run multiple times.
 *
 * Authentication: uses a Zoho OAuth2 refresh token (CATALYST_CLIENT_ID,
 * CATALYST_CLIENT_SECRET, CATALYST_REFRESH_TOKEN) plus CATALYST_PROJECT_ID
 * and CATALYST_PROJECT_DOMAIN env vars. All of these are read at runtime so no
 * credentials are baked into source.
 *
 * Requirements: 10.1, 10.3
 */

import catalyst from "zcatalyst-sdk-node";
import type { CatalystApp } from "zcatalyst-sdk-node/lib/catalyst-app";
import { LOCATIONS, CASES, SUSPECTS, VICTIMS, MO_FEATURES } from "./data";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** Tracks per-table insert/skip counts for the final summary. */
export interface TableSummary {
  tableName: string;
  inserted: number;
  skipped: number;
}

/** Shape of a ZCQL result row — the SDK wraps rows in a { TableName: {...} } object. */
type ZCQLRow = { [tableName: string]: { [column: string]: unknown } };

// ---------------------------------------------------------------------------
// App initialisation
// ---------------------------------------------------------------------------

/**
 * Initialises and returns a CatalystApp using OAuth2 refresh-token credentials
 * read from environment variables.
 *
 * Required env vars:
 *   CATALYST_PROJECT_ID      — numeric Catalyst project ID
 *   CATALYST_PROJECT_KEY     — project key (shown in Catalyst console)
 *   CATALYST_PROJECT_DOMAIN  — project domain, e.g. ksp-crime-ai.catalystserverless.com
 *   CATALYST_CLIENT_ID       — Zoho OAuth client ID
 *   CATALYST_CLIENT_SECRET   — Zoho OAuth client secret
 *   CATALYST_REFRESH_TOKEN   — Zoho OAuth refresh token
 *
 * In a live Catalyst function these values are injected automatically; when
 * running locally, set them in a .env file and load with dotenv before calling
 * this script (e.g. `dotenv -e ../../.env -- ts-node src/run.ts`).
 */
function initApp(): CatalystApp {
  const projectId = process.env["CATALYST_PROJECT_ID"] ?? "";
  const projectKey = process.env["CATALYST_PROJECT_KEY"] ?? "";
  const projectDomain = process.env["CATALYST_PROJECT_DOMAIN"] ?? "";
  const clientId = process.env["CATALYST_CLIENT_ID"] ?? "";
  const clientSecret = process.env["CATALYST_CLIENT_SECRET"] ?? "";
  const refreshToken = process.env["CATALYST_REFRESH_TOKEN"] ?? "";

  const credential = catalyst.credential.refreshToken({
    client_id: clientId,
    client_secret: clientSecret,
    refresh_token: refreshToken,
  });

  return catalyst.initializeApp({
    project_id: projectId,
    project_key: projectKey,
    project_domain: projectDomain,
    environment: "development",
    credential,
  });
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Checks whether a row identified by `idColumn` = `idValue` already exists in
 * `tableName`. Uses ZCQL so no table-level search API is needed.
 *
 * Returns `true` if found, `false` otherwise. On SDK error, logs a warning and
 * returns `false` so insertion is attempted (conservative fallback).
 */
async function rowExists(
  app: CatalystApp,
  tableName: string,
  idColumn: string,
  idValue: string
): Promise<boolean> {
  // Single-quoted string literal — idValue comes from our own static data so
  // it never contains user input; still we sanitise single-quotes defensively.
  const safeValue = idValue.replace(/'/g, "''");
  const zcql = `SELECT ${idColumn} FROM ${tableName} WHERE ${idColumn} = '${safeValue}'`;
  try {
    const rows: ZCQLRow[] = await app.zcql().executeZCQLQuery(zcql);
    return rows.length > 0;
  } catch (err) {
    console.warn(
      `  [WARN] Could not check existence for ${tableName}/${idColumn}=${idValue}: ${
        err instanceof Error ? err.message : String(err)
      }`
    );
    return false;
  }
}

/**
 * Inserts a single row into `tableName`, first checking for existence.
 * Updates the `summary` object in place.
 * Errors are caught and logged per-row without aborting the run.
 */
async function insertIfAbsent(
  app: CatalystApp,
  tableName: string,
  idColumn: string,
  idValue: string,
  rowData: Record<string, unknown>,
  summary: TableSummary
): Promise<void> {
  try {
    const exists = await rowExists(app, tableName, idColumn, idValue);
    if (exists) {
      summary.skipped++;
      return;
    }
    await app.datastore().table(tableName).insertRow(rowData);
    summary.inserted++;
  } catch (err) {
    console.error(
      `  [ERROR] Failed to insert ${tableName} row (${idColumn}=${idValue}): ${
        err instanceof Error ? err.message : String(err)
      }`
    );
  }
}

// ---------------------------------------------------------------------------
// Per-table seed functions
// ---------------------------------------------------------------------------

export async function seedLocations(app: CatalystApp): Promise<TableSummary> {
  const summary: TableSummary = { tableName: "Locations", inserted: 0, skipped: 0 };
  console.log(`\nSeeding ${summary.tableName} (${LOCATIONS.length} rows)…`);
  for (const row of LOCATIONS) {
    await insertIfAbsent(
      app,
      "Locations",
      "location_id",
      row.location_id,
      row as unknown as Record<string, unknown>,
      summary
    );
  }
  return summary;
}

export async function seedCases(app: CatalystApp): Promise<TableSummary> {
  const summary: TableSummary = { tableName: "Cases", inserted: 0, skipped: 0 };
  console.log(`\nSeeding ${summary.tableName} (${CASES.length} rows)…`);
  for (const row of CASES) {
    await insertIfAbsent(
      app,
      "Cases",
      "case_id",
      row.case_id,
      row as unknown as Record<string, unknown>,
      summary
    );
  }
  return summary;
}

export async function seedSuspects(app: CatalystApp): Promise<TableSummary> {
  const summary: TableSummary = { tableName: "Suspects", inserted: 0, skipped: 0 };
  console.log(`\nSeeding ${summary.tableName} (${SUSPECTS.length} rows)…`);
  for (const row of SUSPECTS) {
    await insertIfAbsent(
      app,
      "Suspects",
      "suspect_id",
      row.suspect_id,
      row as unknown as Record<string, unknown>,
      summary
    );
  }
  return summary;
}

export async function seedVictims(app: CatalystApp): Promise<TableSummary> {
  const summary: TableSummary = { tableName: "Victims", inserted: 0, skipped: 0 };
  console.log(`\nSeeding ${summary.tableName} (${VICTIMS.length} rows)…`);
  for (const row of VICTIMS) {
    await insertIfAbsent(
      app,
      "Victims",
      "victim_id",
      row.victim_id,
      row as unknown as Record<string, unknown>,
      summary
    );
  }
  return summary;
}

export async function seedMOFeatures(app: CatalystApp): Promise<TableSummary> {
  const summary: TableSummary = { tableName: "MO_Features", inserted: 0, skipped: 0 };
  console.log(`\nSeeding ${summary.tableName} (${MO_FEATURES.length} rows)…`);
  for (const row of MO_FEATURES) {
    // MO_Features uses case_id as the unique identifier (one feature row per case)
    await insertIfAbsent(
      app,
      "MO_Features",
      "case_id",
      row.case_id,
      row as unknown as Record<string, unknown>,
      summary
    );
  }
  return summary;
}

// ---------------------------------------------------------------------------
// Summary printer
// ---------------------------------------------------------------------------

export function printSummary(summaries: TableSummary[]): void {
  console.log("\n─────────────────────────────────────────");
  console.log("Seed run complete — per-table summary:");
  console.log("─────────────────────────────────────────");
  for (const s of summaries) {
    const total = s.inserted + s.skipped;
    console.log(
      `  [${s.tableName}]  ${s.inserted} inserted, ${s.skipped} skipped  (${total} total)`
    );
  }
  const grandInserted = summaries.reduce((acc, s) => acc + s.inserted, 0);
  const grandSkipped = summaries.reduce((acc, s) => acc + s.skipped, 0);
  console.log("─────────────────────────────────────────");
  console.log(`  TOTAL: ${grandInserted} inserted, ${grandSkipped} skipped`);
  console.log("─────────────────────────────────────────\n");
}

// ---------------------------------------------------------------------------
// Entry point
// ---------------------------------------------------------------------------

async function main(): Promise<void> {
  console.log("KSP Crime AI — Seed Script");
  console.log("Inserting synthetic data into Catalyst Data Store…");

  const app = initApp();

  // Safe insertion order respects FK dependencies:
  //   Locations (no deps) → Cases (→ Locations) → Suspects (→ Cases)
  //   → Victims (→ Cases) → MO_Features (→ Cases)
  const summaries: TableSummary[] = [];

  summaries.push(await seedLocations(app));
  summaries.push(await seedCases(app));
  summaries.push(await seedSuspects(app));
  summaries.push(await seedVictims(app));
  summaries.push(await seedMOFeatures(app));

  printSummary(summaries);
}

// Run only when executed directly (not when imported in tests)
if (require.main === module) {
  main().catch((err: unknown) => {
    console.error("Seed script failed with an unexpected error:", err);
    process.exit(1);
  });
}
