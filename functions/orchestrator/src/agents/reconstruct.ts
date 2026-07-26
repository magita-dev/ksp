/**
 * Query Reconstruction Agent
 *
 * Produces a canonical natural-language query description from a structured
 * ParsedIntent + ExtractedEntities representation.  The output is deterministic:
 * identical input always yields identical output.
 *
 * Requirements: 11.2
 */

import type { ParsedIntent, ExtractedEntities } from "../types";

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Reconstruct a human-readable canonical query description from a parsed
 * structured representation.
 *
 * Rules:
 * - `needs_clarification=true`  → "Clarification needed: <question>"
 * - `unknown`                   → "Query: <entity tokens joined>"
 * - `case_lookup`               → "Find <crime types> cases in <locations>"
 * - `pattern_search`            → "Find cases with similar MO: <mo features>"
 * - `network_query`             → "Show connections for suspect <name>"
 * - `combined`                  → combines case_lookup and pattern_search descriptions
 *
 * Always returns a non-empty string.
 */
export function reconstructQuery(
  parsed: ParsedIntent & ExtractedEntities
): string {
  // -------------------------------------------------------------------
  // 1. Clarification takes highest priority
  // -------------------------------------------------------------------
  if (parsed.needs_clarification) {
    const question = parsed.clarification_question?.trim() ?? "";
    return question.length > 0
      ? `Clarification needed: ${question}`
      : "Clarification needed";
  }

  // -------------------------------------------------------------------
  // 2. Dispatch by intent type
  // -------------------------------------------------------------------
  switch (parsed.type) {
    case "case_lookup":
      return buildCaseLookupDescription(parsed);

    case "pattern_search":
      return buildPatternSearchDescription(parsed);

    case "network_query":
      return buildNetworkQueryDescription(parsed);

    case "combined": {
      const lookupPart = buildCaseLookupDescription(parsed);
      const patternPart = buildPatternSearchDescription(parsed);
      // Only combine if both parts add meaningful content
      if (lookupPart !== "Find cases" && patternPart !== "Find cases with similar MO") {
        return `${lookupPart}; ${patternPart}`;
      }
      if (lookupPart !== "Find cases") return lookupPart;
      if (patternPart !== "Find cases with similar MO") return patternPart;
      return buildUnknownDescription(parsed);
    }

    case "unknown":
    default:
      return buildUnknownDescription(parsed);
  }
}

// ---------------------------------------------------------------------------
// Intent-specific description builders
// ---------------------------------------------------------------------------

function buildCaseLookupDescription(
  parsed: ParsedIntent & ExtractedEntities
): string {
  // Crime types
  const crimes = parsed.crime_types.filter(Boolean);

  let description = crimes.length > 0
    ? `Find ${crimes.join(", ")} cases`
    : "Find cases";

  // Locations
  const locs = parsed.locations.filter(Boolean);
  if (locs.length > 0) {
    description += ` in ${locs.join(", ")}`;
  }

  // Date range
  if (parsed.date_range) {
    description += ` from ${parsed.date_range.from} to ${parsed.date_range.to}`;
  }

  // Suspect names
  const suspects = parsed.suspect_names.filter(Boolean);
  if (suspects.length > 0) {
    description += ` involving suspect ${suspects.join(", ")}`;
  }

  // Case IDs
  const caseIds = parsed.case_ids.filter(Boolean);
  if (caseIds.length > 0) {
    description += ` (case ${caseIds.join(", ")})`;
  }

  return description;
}

function buildPatternSearchDescription(
  parsed: ParsedIntent & ExtractedEntities
): string {
  const moTokens: string[] = [];
  const mo = parsed.mo_features ?? {};

  if (mo.entry_method) moTokens.push(`entry_method=${mo.entry_method}`);
  if (mo.time_of_day) moTokens.push(`time_of_day=${mo.time_of_day}`);
  if (mo.weapon_type) moTokens.push(`weapon_type=${mo.weapon_type}`);
  if (mo.victim_age_group) moTokens.push(`victim_age_group=${mo.victim_age_group}`);
  if (mo.target_type) moTokens.push(`target_type=${mo.target_type}`);

  // Include Zia entities if present
  const ziaEntities = parsed.zia_entities ?? [];
  for (const ze of ziaEntities) {
    moTokens.push(`zia:${ze.type}=${ze.value}`);
  }

  // Also include case IDs as reference seeds for pattern search
  const caseIds = parsed.case_ids.filter(Boolean);

  if (moTokens.length === 0 && caseIds.length === 0) {
    // Fall back to crime types if nothing more specific
    const crimes = parsed.crime_types.filter(Boolean);
    if (crimes.length > 0) {
      return `Find cases with similar MO to ${crimes.join(", ")} cases`;
    }
    return "Find cases with similar MO";
  }

  let description = "Find cases with similar MO";

  if (caseIds.length > 0) {
    description += ` to ${caseIds.join(", ")}`;
  }

  if (moTokens.length > 0) {
    description += `: ${moTokens.join(", ")}`;
  }

  return description;
}

function buildNetworkQueryDescription(
  parsed: ParsedIntent & ExtractedEntities
): string {
  const suspects = parsed.suspect_names.filter(Boolean);
  const caseIds = parsed.case_ids.filter(Boolean);

  if (suspects.length > 0) {
    return `Show connections for suspect ${suspects.join(", ")}`;
  }

  if (caseIds.length > 0) {
    return `Show network connections for case ${caseIds.join(", ")}`;
  }

  const locs = parsed.locations.filter(Boolean);
  if (locs.length > 0) {
    return `Show network connections in ${locs.join(", ")}`;
  }

  return "Show network connections";
}

function buildUnknownDescription(
  parsed: ParsedIntent & ExtractedEntities
): string {
  // Gather all entity tokens for a best-effort reconstruction
  const tokens: string[] = [
    ...parsed.crime_types,
    ...parsed.locations,
    ...parsed.suspect_names,
    ...parsed.case_ids,
  ].filter(Boolean);

  // Add MO tokens if present
  const mo = parsed.mo_features ?? {};
  if (mo.entry_method) tokens.push(mo.entry_method);
  if (mo.time_of_day) tokens.push(mo.time_of_day);
  if (mo.weapon_type) tokens.push(mo.weapon_type);
  if (mo.victim_age_group) tokens.push(mo.victim_age_group);
  if (mo.target_type) tokens.push(mo.target_type);

  if (tokens.length === 0) {
    return "Query: (no entities)";
  }

  return `Query: ${tokens.join(", ")}`;
}
