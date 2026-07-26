/**
 * Catalyst Data Store schema definitions for the KSP Crime AI seed script.
 *
 * Catalyst Data Store does not use SQL DDL, so this file exports TypeScript
 * constants that document table names and column definitions. The seed script
 * uses these constants to validate data and document the schema.
 *
 * Column names and types match the data-model definitions in design.md exactly.
 *
 * Requirements: 10.4, 9.3
 */

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type ColumnDef = {
  name: string;
  type: "String" | "Long" | "Integer" | "Decimal" | "DateTime" | "Boolean";
  notes?: string;
};

export type TableSchema = {
  tableName: string;
  columns: ColumnDef[];
};

// ---------------------------------------------------------------------------
// Cases
// ---------------------------------------------------------------------------

export const CASES_SCHEMA: TableSchema = {
  tableName: "Cases",
  columns: [
    { name: "ROWID",       type: "Long",     notes: "PK (auto)" },
    { name: "case_id",     type: "String",   notes: "Human-readable ID, e.g. KSP-2024-001" },
    { name: "title",       type: "String" },
    { name: "narrative",   type: "String",   notes: "Free-text description; Zia-enriched" },
    { name: "crime_type",  type: "String",   notes: "e.g. robbery, burglary" },
    { name: "status",      type: "String",   notes: "open, closed, under_investigation" },
    { name: "filed_date",  type: "DateTime" },
    { name: "location_id", type: "Long",     notes: "FK → Locations.ROWID" },
  ],
};

// ---------------------------------------------------------------------------
// Suspects
// ---------------------------------------------------------------------------

export const SUSPECTS_SCHEMA: TableSchema = {
  tableName: "Suspects",
  columns: [
    { name: "ROWID",            type: "Long" },
    { name: "suspect_id",       type: "String" },
    { name: "name",             type: "String",  notes: "PII" },
    { name: "age",              type: "Integer" },
    { name: "known_associates", type: "String",  notes: "JSON array of suspect_ids" },
    { name: "case_ids",         type: "String",  notes: "JSON array of case_ids" },
  ],
};

// ---------------------------------------------------------------------------
// Victims
// ---------------------------------------------------------------------------

export const VICTIMS_SCHEMA: TableSchema = {
  tableName: "Victims",
  columns: [
    { name: "ROWID",      type: "Long" },
    { name: "victim_id",  type: "String" },
    { name: "name",       type: "String",   notes: "PII" },
    { name: "age",        type: "Integer" },
    { name: "age_group",  type: "String",   notes: "child, youth, adult, elderly" },
    { name: "case_id",    type: "Long",     notes: "FK → Cases.ROWID" },
  ],
};

// ---------------------------------------------------------------------------
// Locations
// ---------------------------------------------------------------------------

export const LOCATIONS_SCHEMA: TableSchema = {
  tableName: "Locations",
  columns: [
    { name: "ROWID",           type: "Long" },
    { name: "location_id",     type: "String" },
    { name: "district",        type: "String" },
    { name: "taluk",           type: "String" },
    { name: "village_or_area", type: "String" },
    { name: "latitude",        type: "Decimal" },
    { name: "longitude",       type: "Decimal" },
  ],
};

// ---------------------------------------------------------------------------
// MO_Features
// ---------------------------------------------------------------------------

export const MO_FEATURES_SCHEMA: TableSchema = {
  tableName: "MO_Features",
  columns: [
    { name: "ROWID",             type: "Long" },
    { name: "case_id",           type: "Long",   notes: "FK → Cases.ROWID" },
    { name: "entry_method",      type: "String", notes: "e.g. forced_door, window, social_engineering" },
    { name: "time_of_day",       type: "String", notes: "morning, afternoon, evening, night" },
    { name: "weapon_type",       type: "String", notes: "e.g. knife, firearm, none" },
    { name: "victim_age_group",  type: "String", notes: "mirrors Victims.age_group" },
    { name: "target_type",       type: "String", notes: "e.g. residential, commercial, vehicle" },
    { name: "zia_entities_json", type: "String", notes: "JSON: cached Zia extraction from Cases.narrative" },
  ],
};

// ---------------------------------------------------------------------------
// Audit_Log
// ---------------------------------------------------------------------------

export const AUDIT_LOG_SCHEMA: TableSchema = {
  tableName: "Audit_Log",
  columns: [
    { name: "ROWID",                 type: "Long" },
    { name: "audit_id",              type: "String",   notes: "UUID" },
    { name: "queried_by",            type: "String",   notes: "Catalyst Auth user ID" },
    { name: "query_text",            type: "String" },
    { name: "agents_invoked",        type: "String",   notes: "JSON array" },
    { name: "tables_accessed",       type: "String",   notes: "JSON array" },
    { name: "pii_access",            type: "Boolean" },
    { name: "timestamp",             type: "DateTime" },
    { name: "reasoning_trace_json",  type: "String",   notes: "Full ReasoningTrace JSON" },
    { name: "retention_expires_at",  type: "DateTime", notes: "timestamp + 90 days" },
  ],
};

// ---------------------------------------------------------------------------
// Aggregates
// ---------------------------------------------------------------------------

/** All six Catalyst Data Store table schemas in insertion-safe order. */
export const ALL_SCHEMAS: TableSchema[] = [
  LOCATIONS_SCHEMA,
  CASES_SCHEMA,
  SUSPECTS_SCHEMA,
  VICTIMS_SCHEMA,
  MO_FEATURES_SCHEMA,
  AUDIT_LOG_SCHEMA,
];

/** Tables that contain Personally Identifiable Information (PII). */
export const PII_TABLES: string[] = ["Suspects", "Victims"];
