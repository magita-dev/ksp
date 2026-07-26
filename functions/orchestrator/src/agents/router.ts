/**
 * Router / Query Understanding Agent
 *
 * Calls Gemini API server-side with a few-shot structured prompt to parse natural
 * language queries into ParsedIntent + ExtractedEntities as JSON.
 *
 * Handles:
 * - needs_clarification path: returns clarification question without routing downstream
 * - unknown intent: returns guidance message listing supported query types
 * - Exponential back-off (3 retries: 1s / 2s / 4s) for Gemini rate-limit errors
 * - Regex fallback if JSON is malformed after one re-prompt
 *
 * Requirements: 1.1, 1.2, 1.3, 1.5, 6.5
 */

import {
  GoogleGenerativeAI,
  GenerativeModel,
  GoogleGenerativeAIFetchError,
} from "@google/generative-ai";
import type { ParsedIntent, ExtractedEntities } from "../types";

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

export interface RouterResult {
  parsed_intent: ParsedIntent;
  entities: ExtractedEntities;
  /** Set when intent.type === "unknown" to guide the investigator. */
  guidance_message?: string;
}

/** Shape we expect back from Gemini as JSON. */
interface GeminiRouterResponse {
  type: ParsedIntent["type"];
  needs_clarification: boolean;
  clarification_question?: string;
  locations: string[];
  date_range?: { from: string; to: string };
  crime_types: string[];
  suspect_names: string[];
  case_ids: string[];
  mo_features: {
    entry_method?: string;
    time_of_day?: "morning" | "afternoon" | "evening" | "night";
    weapon_type?: string;
    victim_age_group?: "child" | "youth" | "adult" | "elderly";
    target_type?: string;
  };
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const MODEL_NAME = "gemini-1.5-flash";

const RETRY_DELAYS_MS = [1000, 2000, 4000];

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
// Few-shot prompt construction
// ---------------------------------------------------------------------------

const JSON_SCHEMA = `{
  "type": "case_lookup" | "pattern_search" | "network_query" | "combined" | "unknown",
  "needs_clarification": boolean,
  "clarification_question": string | null,
  "locations": string[],
  "date_range": { "from": "YYYY-MM-DD", "to": "YYYY-MM-DD" } | null,
  "crime_types": string[],
  "suspect_names": string[],
  "case_ids": string[],
  "mo_features": {
    "entry_method": string | null,
    "time_of_day": "morning" | "afternoon" | "evening" | "night" | null,
    "weapon_type": string | null,
    "victim_age_group": "child" | "youth" | "adult" | "elderly" | null,
    "target_type": string | null
  }
}`;

const FEW_SHOT_EXAMPLES = `
--- EXAMPLES ---

Query: "Find burglary cases in Bengaluru last month"
Response:
{
  "type": "case_lookup",
  "needs_clarification": false,
  "clarification_question": null,
  "locations": ["Bengaluru"],
  "date_range": { "from": "YYYY-MM-01", "to": "YYYY-MM-30" },
  "crime_types": ["burglary"],
  "suspect_names": [],
  "case_ids": [],
  "mo_features": {}
}

Query: "Cases similar to KSP-2024-001"
Response:
{
  "type": "pattern_search",
  "needs_clarification": false,
  "clarification_question": null,
  "locations": [],
  "date_range": null,
  "crime_types": [],
  "suspect_names": [],
  "case_ids": ["KSP-2024-001"],
  "mo_features": {}
}

Query: "Show connections between suspect S-001 and recent robbery cases in Mysuru"
Response:
{
  "type": "network_query",
  "needs_clarification": false,
  "clarification_question": null,
  "locations": ["Mysuru"],
  "date_range": null,
  "crime_types": ["robbery"],
  "suspect_names": [],
  "case_ids": [],
  "mo_features": {}
}

Query: "Burglaries at night using forced door entry on residential properties"
Response:
{
  "type": "pattern_search",
  "needs_clarification": false,
  "clarification_question": null,
  "locations": [],
  "date_range": null,
  "crime_types": ["burglary"],
  "suspect_names": [],
  "case_ids": [],
  "mo_features": {
    "entry_method": "forced_door",
    "time_of_day": "night",
    "weapon_type": null,
    "victim_age_group": null,
    "target_type": "residential"
  }
}

Query: "ಕಳ್ಳತನ ಪ್ರಕರಣಗಳು ಬೆಂಗಳೂರಿನಲ್ಲಿ"
Response:
{
  "type": "case_lookup",
  "needs_clarification": false,
  "clarification_question": null,
  "locations": ["Bengaluru"],
  "date_range": null,
  "crime_types": ["theft"],
  "suspect_names": [],
  "case_ids": [],
  "mo_features": {}
}

Query: "robbery"
Response:
{
  "type": "case_lookup",
  "needs_clarification": true,
  "clarification_question": "Could you provide more details? For example: a specific location, date range, suspect name, or case ID?",
  "locations": [],
  "date_range": null,
  "crime_types": ["robbery"],
  "suspect_names": [],
  "case_ids": [],
  "mo_features": {}
}

--- END EXAMPLES ---
`;

function buildSystemPrompt(): string {
  return (
    "You are a query-understanding agent for the Karnataka State Police crime database system.\n" +
    "Your task is to parse a natural language query (English or basic Kannada) into structured JSON.\n\n" +
    "Rules:\n" +
    "- Respond ONLY with valid JSON matching the schema below. No prose, no markdown fences.\n" +
    "- Set needs_clarification=true only if critical information is missing to form a useful query.\n" +
    "- Use type=unknown only when the query has no relation to crime, cases, suspects, or locations.\n" +
    "- For date_range, output ISO 8601 dates (YYYY-MM-DD); use relative offsets based on today's date.\n" +
    "- For mo_features, only include fields explicitly mentioned or strongly implied.\n\n" +
    "Schema:\n" +
    JSON_SCHEMA +
    "\n\n" +
    FEW_SHOT_EXAMPLES
  );
}

function buildUserPrompt(queryText: string): string {
  return `Query: "${queryText}"\nResponse:`;
}

function buildReprompt(queryText: string): string {
  return (
    `The previous response was not valid JSON. Please respond ONLY with a JSON object matching this schema:\n` +
    JSON_SCHEMA +
    `\n\nQuery: "${queryText}"\nResponse:`
  );
}

// ---------------------------------------------------------------------------
// Sleep helper
// ---------------------------------------------------------------------------

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// ---------------------------------------------------------------------------
// Regex-based fallback extraction
// ---------------------------------------------------------------------------

/** Minimal regex extraction used when Gemini returns malformed JSON twice. */
function regexExtract(queryText: string): GeminiRouterResponse {
  const text = queryText.toLowerCase();

  // Locations: major Karnataka cities / districts
  const locationPatterns = [
    "bengaluru", "bangalore", "mysuru", "mysore", "hubli", "dharwad",
    "mangaluru", "mangalore", "belagavi", "belgaum", "kalaburagi", "gulbarga",
    "shivamogga", "shimoga", "tumakuru", "tumkur", "davanagere", "bellary",
    "ballari", "vijayapura", "bijapur", "hassan", "mandya", "udupi",
    "chikkamagaluru", "kodagu", "coorg", "raichur", "koppal", "gadag",
    "haveri", "uttara kannada", "dakshina kannada", "bidar", "yadgir",
    "chamarajanagar", "ramanagara", "chikkaballapur", "bangalore rural",
  ];
  const locations = locationPatterns.filter((loc) => text.includes(loc));

  // Crime types
  const crimePatterns = [
    "burglary", "robbery", "theft", "murder", "assault", "fraud",
    "kidnapping", "rape", "extortion", "cheating", "dacoity",
    "ಕಳ್ಳತನ", "ದರೋಡೆ", "ಕೊಲೆ",
  ];
  const crime_types = crimePatterns.filter((c) => text.includes(c));

  // Case IDs (e.g., KSP-2024-001)
  const caseIdMatch = queryText.match(/KSP-\d{4}-\d+/gi) ?? [];
  const case_ids = caseIdMatch;

  // Date patterns: "last month", "last week", "last year", "this year"
  let date_range: { from: string; to: string } | undefined;
  const now = new Date();
  if (text.includes("last month")) {
    const firstDay = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    const lastDay = new Date(now.getFullYear(), now.getMonth(), 0);
    date_range = {
      from: firstDay.toISOString().slice(0, 10),
      to: lastDay.toISOString().slice(0, 10),
    };
  } else if (text.includes("last week")) {
    const lastMonday = new Date(now);
    lastMonday.setDate(now.getDate() - now.getDay() - 6);
    const lastSunday = new Date(lastMonday);
    lastSunday.setDate(lastMonday.getDate() + 6);
    date_range = {
      from: lastMonday.toISOString().slice(0, 10),
      to: lastSunday.toISOString().slice(0, 10),
    };
  } else if (text.includes("last year") || text.includes("this year")) {
    const year = text.includes("last year") ? now.getFullYear() - 1 : now.getFullYear();
    date_range = {
      from: `${year}-01-01`,
      to: `${year}-12-31`,
    };
  }

  // MO features
  const entry_method = text.includes("forced") || text.includes("break")
    ? "forced_door"
    : text.includes("window")
    ? "window"
    : text.includes("social")
    ? "social_engineering"
    : undefined;

  const time_of_day = text.includes("night")
    ? "night"
    : text.includes("morning")
    ? "morning"
    : text.includes("afternoon")
    ? "afternoon"
    : text.includes("evening")
    ? "evening"
    : undefined;

  const weapon_type = text.includes("knife")
    ? "knife"
    : text.includes("gun") || text.includes("firearm")
    ? "firearm"
    : text.includes("no weapon") || text.includes("unarmed")
    ? "none"
    : undefined;

  const target_type = text.includes("residential") || text.includes("house") || text.includes("home")
    ? "residential"
    : text.includes("commercial") || text.includes("shop") || text.includes("store")
    ? "commercial"
    : text.includes("vehicle") || text.includes("car") || text.includes("bike")
    ? "vehicle"
    : undefined;

  // Determine intent type
  const hasMoFeatures = !!(entry_method || time_of_day || weapon_type || target_type);
  const hasCaseId = case_ids.length > 0;
  const hasSimilar = text.includes("similar") || text.includes("like") || text.includes("pattern");
  const hasNetwork = text.includes("connection") || text.includes("network") || text.includes("linked");

  let type: ParsedIntent["type"] = "unknown";
  if (hasNetwork) {
    type = "network_query";
  } else if (hasCaseId && hasSimilar) {
    type = "pattern_search";
  } else if (hasMoFeatures || hasSimilar) {
    type = "pattern_search";
  } else if (crime_types.length > 0 || locations.length > 0 || date_range) {
    type = "case_lookup";
  }

  return {
    type,
    needs_clarification: false,
    clarification_question: undefined,
    locations,
    date_range,
    crime_types,
    suspect_names: [],
    case_ids,
    mo_features: {
      entry_method,
      time_of_day,
      weapon_type,
      target_type,
    },
  };
}

// ---------------------------------------------------------------------------
// JSON parsing
// ---------------------------------------------------------------------------

function tryParseJson(text: string): GeminiRouterResponse | null {
  // Strip optional markdown code fences
  const cleaned = text.replace(/^```(?:json)?\s*/i, "").replace(/\s*```\s*$/, "").trim();
  try {
    const parsed = JSON.parse(cleaned) as unknown;
    if (typeof parsed !== "object" || parsed === null) return null;
    const obj = parsed as Record<string, unknown>;
    // Validate required field
    if (typeof obj["type"] !== "string") return null;
    return obj as unknown as GeminiRouterResponse;
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// Rate-limit detection
// ---------------------------------------------------------------------------

function isRateLimitError(err: unknown): boolean {
  if (err instanceof GoogleGenerativeAIFetchError) {
    return err.status === 429;
  }
  // Generic check for objects with status/statusCode
  if (typeof err === "object" && err !== null) {
    const e = err as Record<string, unknown>;
    const status = e["status"] ?? e["statusCode"];
    if (status === 429) return true;
    const message = String(e["message"] ?? "").toLowerCase();
    if (message.includes("quota") || message.includes("rate limit") || message.includes("429")) {
      return true;
    }
  }
  return false;
}

// ---------------------------------------------------------------------------
// Gemini call with retry
// ---------------------------------------------------------------------------

async function callGeminiWithRetry(
  model: GenerativeModel,
  prompt: string
): Promise<string> {
  let lastError: unknown;
  for (let attempt = 0; attempt <= RETRY_DELAYS_MS.length; attempt++) {
    try {
      const result = await model.generateContent(prompt);
      return result.response.text();
    } catch (err) {
      lastError = err;
      if (isRateLimitError(err) && attempt < RETRY_DELAYS_MS.length) {
        await sleep(RETRY_DELAYS_MS[attempt]);
        continue;
      }
      throw err;
    }
  }
  throw lastError;
}

// ---------------------------------------------------------------------------
// Main export
// ---------------------------------------------------------------------------

/**
 * Runs the router agent: parses a natural language query into intent + entities.
 *
 * @param queryText  The investigator's raw query string.
 * @param _app       Catalyst app context (unused by router; kept for graph interface compatibility).
 * @param geminiClient  Optional pre-built GenerativeModel for dependency injection in tests.
 */
export async function runRouter(
  queryText: string,
  _app: unknown,
  geminiClient?: GenerativeModel
): Promise<RouterResult> {
  // Build (or reuse) the Gemini model
  const model: GenerativeModel = geminiClient ?? (() => {
    const apiKey = process.env["GEMINI_API_KEY"] ?? "";
    const genAI = new GoogleGenerativeAI(apiKey);
    return genAI.getGenerativeModel({
      model: MODEL_NAME,
      systemInstruction: buildSystemPrompt(),
    });
  })();

  const userPrompt = buildUserPrompt(queryText);

  let raw: string;
  let parsed: GeminiRouterResponse | null = null;

  try {
    raw = await callGeminiWithRetry(model, userPrompt);
    parsed = tryParseJson(raw);

    // If first parse failed, re-prompt once with explicit schema reminder
    if (parsed === null) {
      const reprompt = buildReprompt(queryText);
      try {
        raw = await callGeminiWithRetry(model, reprompt);
        parsed = tryParseJson(raw);
      } catch {
        // Re-prompt call failed — fall through to regex
      }
    }
  } catch (err) {
    // If all Gemini calls failed (e.g. max retries exhausted), fall back to regex
    if (!isRateLimitError(err) || true) {
      // Use regex for any hard failure
      parsed = null;
    }
  }

  // Final fallback: regex-based extraction
  if (parsed === null) {
    parsed = regexExtract(queryText);
  }

  // ---------------------------------------------------------------------------
  // Assemble RouterResult
  // ---------------------------------------------------------------------------

  const parsedIntent: ParsedIntent = {
    type: parsed.type,
    needs_clarification: parsed.needs_clarification ?? false,
    clarification_question: parsed.clarification_question ?? undefined,
  };

  const entities: ExtractedEntities = {
    locations: Array.isArray(parsed.locations) ? parsed.locations : [],
    date_range: parsed.date_range ?? undefined,
    crime_types: Array.isArray(parsed.crime_types) ? parsed.crime_types : [],
    suspect_names: Array.isArray(parsed.suspect_names) ? parsed.suspect_names : [],
    case_ids: Array.isArray(parsed.case_ids) ? parsed.case_ids : [],
    mo_features: parsed.mo_features ?? {},
  };

  const result: RouterResult = { parsed_intent: parsedIntent, entities };

  // Attach guidance message for unknown intent (Requirement 1.5)
  if (parsedIntent.type === "unknown") {
    result.guidance_message = GUIDANCE_MESSAGE;
  }

  // Clarification path: needs_clarification=true means we return immediately
  // without routing downstream (Requirement 1.3). The caller (orchestrator) is
  // responsible for inspecting needs_clarification before forwarding to agents.

  return result;
}
