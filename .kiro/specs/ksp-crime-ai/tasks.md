# Implementation Plan: KSP Crime AI

## Overview

Incremental build following the demo-priority order: seed data first so every subsequent step is testable, then a minimal round-trip, then Gemini, then full LangGraph orchestration, then the headline Case-Linking Agent, then explainability + audit, then voice, then optional stretch items.

All code is TypeScript. Property-based tests use `fast-check` (minimum 100 runs each). Catalyst Data Store, Auth, and Gemini are mocked in all unit/property tests; integration tests are tagged `@integration` and excluded from the default CI run.

---

## Tasks

- [x] 1. Scaffold project structure and shared types
  - Create monorepo layout: `frontend/` (Next.js / Catalyst Slate), `functions/orchestrator/` (Catalyst Advanced I/O Function), `scripts/seed/`
  - Define all shared TypeScript interfaces in `functions/orchestrator/src/types.ts`: `AgentState`, `ParsedIntent`, `ExtractedEntities`, `MOFeatures`, `QueryResult`, `LinkedCase`, `NetworkResult`, `NetworkEntity`, `NetworkEdge`, `ReasoningTrace`, `AuditRecord`, `AgentError`, `ConversationMessage`, `VoiceInterfaceState`
  - Add `fast-check` as a dev dependency; configure global numRuns=100 in `jest.setup.ts` (or vitest equivalent)
  - _Requirements: 9.1, 9.2, 9.3_

- [x] 2. Synthetic dataset and seed script
  - [x] 2.1 Define schema SQL / DDL constants in `scripts/seed/schema.ts` for all six tables: `Cases`, `Suspects`, `Victims`, `Locations`, `MO_Features`, `Audit_Log`
    - Column names must exactly match the data-model definitions in the design document
    - _Requirements: 10.4, 9.3_
  - [x] 2.2 Generate synthetic data in `scripts/seed/data.ts`
    - Minimum records: 50 cases, 40 suspects, 50 victims, 20 locations, 50 MO_Feature rows (one per case), varied `crime_type`, `status`, and MO feature values
    - Include at least 5 clusters of cases sharing 3+ MO features (to make Jaccard demo compelling)
    - _Requirements: 10.1, 10.2_
  - [x] 2.3 Write `scripts/seed/run.ts` that inserts the synthetic rows into Catalyst Data Store via the Catalyst Node SDK
    - Idempotent: skip insert if `case_id` already exists
    - Print summary of rows inserted per table
    - _Requirements: 10.1, 10.3_
  - [ ]* 2.4 Write integration test: run seed script against test Data Store → all five entity tables have records; seed data column names match schema definitions exactly
    - _Requirements: 10.1, 10.2_

- [x] 3. Checkpoint — seed script runs cleanly
  - Ensure the seed script executes without errors against a local/sandbox Catalyst environment and all five tables are populated. Ask the user if questions arise.

- [x] 4. Catalyst Advanced I/O Function skeleton and round-trip wiring
  - [x] 4.1 Bootstrap the Catalyst Function entry point in `functions/orchestrator/src/index.ts`
    - Accept `POST /api/query` with body `{ query_text: string }`
    - Validate Catalyst Auth session (return HTTP 401 if missing)
    - For now, return a stub response `{ answer: "stub", reasoning_trace: {} }`
    - _Requirements: 9.2, 5.3_
  - [x] 4.2 Wire the Next.js API route `frontend/src/app/api/query/route.ts` to forward the request to the Catalyst Function endpoint, attaching the session cookie
    - _Requirements: 9.1_
  - [x] 4.3 Build a minimal chat UI page in `frontend/src/app/page.tsx`
    - Input field + submit button, conversation message list, loading indicator
    - No reasoning panel yet; renders `answer` text from the function response
    - _Requirements: 9.1_
  - [ ]* 4.4 Write unit test: unauthenticated request to the function endpoint returns HTTP 401 before any agent logic executes
    - _Requirements: 5.3_

- [x] 5. Router agent — Gemini-powered intent parsing
  - [x] 5.1 Implement `functions/orchestrator/src/agents/router.ts`
    - Call Gemini API (server-side) with a few-shot structured prompt to produce `ParsedIntent + ExtractedEntities` as JSON
    - Handle `needs_clarification` path: return `clarification_question` without routing downstream
    - Handle `unknown` intent: return guidance message listing supported query types
    - Use exponential back-off (3 retries: 1 s / 2 s / 4 s) for Gemini rate-limit errors; fall back to regex extraction if JSON response is malformed after one re-prompt
    - _Requirements: 1.1, 1.2, 1.3, 1.5, 6.5_
  - [ ]* 5.2 Write property test — Property 1: arbitrary non-empty query strings → router output always has `type` and `entities`
    - **Property 1: Query parsing always produces structured output**
    - **Validates: Requirements 1.2, 11.1**
  - [ ]* 5.3 Write property test — Property 3: router outputs with `needs_clarification=true` → exactly one `clarification_question` string, no downstream routing
    - **Property 3: Clarification produces exactly one question**
    - **Validates: Requirements 1.3**
  - [ ]* 5.4 Write unit tests for Router: fixed English and basic Kannada queries → expected intent types; completely unrecognisable query → guidance message returned
    - _Requirements: 1.1, 1.5_

- [x] 6. Structured Query Agent and first working ZCQL round-trip
  - [x] 6.1 Implement `functions/orchestrator/src/agents/structuredQuery.ts`
    - Map `ParsedIntent.type` to a ZCQL template; substitute `ExtractedEntities` fields via parameterised binding (no string-interpolated user input)
    - Execute ZCQL against Catalyst Data Store; return `QueryResult` including `filters_applied` (human-readable, never raw ZCQL)
    - Handle zero-results and Data Store error paths per the error-handling spec
    - _Requirements: 2.1, 2.2, 2.3, 2.4, 2.5_
  - [x] 6.2 Wire Router → Structured Query Agent in the function entry point (pre-LangGraph, direct call chain)
    - Return a real answer derived from the seed dataset via the chat UI
    - _Requirements: 2.1, 2.2_
  - [ ]* 6.3 Write property test — Property 4: random intents/entities → `filters_applied` contains no ZCQL keywords (`SELECT`, `FROM`, `WHERE`, `=`, `AND`, `OR`, `LIKE`, `ORDER BY`, `LIMIT`)
    - **Property 4: ZCQL output contains no raw syntax in investigator-facing text**
    - **Validates: Requirements 2.5**
  - [ ]* 6.4 Write unit tests: SQA zero-results edge case; SQA Data Store error edge case
    - _Requirements: 2.3, 2.4_

- [x] 7. Checkpoint — end-to-end query round-trip
  - A typed query in the chat UI reaches the Function, parses intent, executes ZCQL against the seeded dataset, and returns a data-grounded answer. Ensure all tests pass. Ask the user if questions arise.

- [x] 8. LangGraph orchestrator — directed agent graph
  - [x] 8.1 Install `@langchain/langgraph` in the Function package; define `AgentState` as the graph state type
    - _Requirements: 6.1, 6.2_
  - [x] 8.2 Implement `functions/orchestrator/src/graph.ts`
    - Declare graph nodes: `router_node`, `structured_query_node`, `case_linking_node`, `network_analysis_node`, `explainability_node`, `clarification_node`, `error_node`
    - Add conditional edges from `router_node` matching the intent-type routing table in the design
    - Each node reads from and writes to the shared `AgentState`; each appends its step to `AgentState.reasoning_trace`
    - Replace the direct call chain from task 6.2 with the LangGraph graph invocation
    - _Requirements: 6.1, 6.2, 6.3, 6.4_
  - [ ]* 8.3 Write property test — Property 2: random known-intent `ParsedIntent` (type ≠ `unknown`, `needs_clarification=false`) → orchestrator routes to at least one downstream agent
    - **Property 2: Routing targets are always non-empty for known intents**
    - **Validates: Requirements 1.4**
  - [ ]* 8.4 Write property test — Property 15: random known intent types → execution sequence matches the conditional edge map
    - **Property 15: Agent execution sequence matches declared graph edges**
    - **Validates: Requirements 6.1**
  - [ ]* 8.5 Write property test — Property 16: random multi-agent runs (mocked nodes) → `ReasoningTrace.agents_invoked` contains all executed node names
    - **Property 16: Reasoning trace accumulates across all invoked agents**
    - **Validates: Requirements 6.4**
  - [ ]* 8.6 Write unit test: error injected into a graph node → orchestrator transitions to `error_node`, partial `ReasoningTrace` returned with `failed_step` set
    - _Requirements: 6.3_

- [x] 9. Case Linking Agent — Jaccard + Zia enrichment
  - [x] 9.1 Implement `functions/orchestrator/src/clients/zia.ts`
    - Thin wrapper around Catalyst Zia REST API; call `text-analytics/entity` endpoint; return `ZiaEntity[]`
    - If Zia call fails, return empty array and annotate trace with `zia_enrichment: "unavailable"` (non-critical path)
    - _Requirements: 3.3_
  - [x] 9.2 Implement `functions/orchestrator/src/agents/caseLinking.ts`
    - Fetch all `MO_Features` rows from Catalyst Data Store
    - For the seed case, call `zia.ts` to extract entities from `Cases.narrative`; merge into feature set as `"zia:<entity>"` strings
    - Compute Jaccard score for every other case: `score = |A ∩ B| / |A ∪ B|` where each element is a `"field:value"` or `"zia:<entity>"` string
    - Return only cases with `jaccard_score >= JACCARD_THRESHOLD` (env var, default `0.6`)
    - `LinkedCase.matching_features` lists the intersecting feature strings; output label must not contain assertive offender language
    - If no cases meet the threshold, return an explicit no-match message
    - _Requirements: 3.1, 3.2, 3.3, 3.4, 3.5, 3.6_
  - [ ]* 9.3 Write property test — Property 5: random case sets → score count equals total cases minus one
    - **Property 5: Jaccard scores are computed for all cases**
    - **Validates: Requirements 3.1**
  - [ ]* 9.4 Write property test — Property 6: random case sets → all returned `LinkedCase` objects have `jaccard_score >= JACCARD_THRESHOLD`
    - **Property 6: Only above-threshold cases are surfaced**
    - **Validates: Requirements 3.2**
  - [ ]* 9.5 Write property test — Property 7: random MO features + non-empty narrative → enriched feature set size >= raw feature set size
    - **Property 7: Zia enrichment only adds features, never removes**
    - **Validates: Requirements 3.3**
  - [ ]* 9.6 Write property test — Property 8: random `LinkedCase` outputs → `label` / description strings contain none of: "same offender", "committed by the same person", or equivalent assertive phrases
    - **Property 8: Case linking output does not assert shared offender**
    - **Validates: Requirements 3.4**
  - [ ]* 9.7 Write property test — Property 9: random `LinkedCase` outputs → `jaccard_score` ∈ [0.0, 1.0] and `matching_features` is non-empty
    - **Property 9: Each surfaced match includes score and matching features**
    - **Validates: Requirements 3.6**
  - [ ]* 9.8 Write unit test: all Jaccard scores below threshold → "no sufficiently similar cases found" message returned
    - _Requirements: 3.5_

- [x] 10. Checkpoint — Case Linking Agent demo
  - Fire a pattern-search query via the chat UI; confirm the response surfaces MO-similar cases with Jaccard scores and matching features visible. Ensure all tests pass. Ask the user if questions arise.

- [ ] 11. Explainability Layer and Audit Logger
  - [x] 11.1 Implement `functions/orchestrator/src/agents/explainability.ts`
    - Assemble `ReasoningTrace` from `AgentState` (all required fields must be present, using empty lists for fields not populated by the current intent path)
    - If a node set `AgentState.error`, populate `failed_step` and `partial_results` in the trace
    - Return the structured JSON response to the client including `reasoning_trace`
    - _Requirements: 4.1, 4.3, 4.5_
  - [x] 11.2 Implement `functions/orchestrator/src/audit.ts`
    - Write one `AuditRecord` per completed query to the `Audit_Log` Catalyst Data Store table
    - Set `pii_access = true` if and only if `tables_accessed` includes `"Suspects"` or `"Victims"`
    - Set `retention_expires_at = timestamp + 90 days`
    - _Requirements: 5.1, 5.2, 5.4_
  - [x] 11.3 Render the collapsible "Why this answer?" panel in `frontend/src/app/page.tsx`
    - Toggle open/closed; display `zcql_filters`, `jaccard_scores`, `zia_entities`, `agents_invoked`, and `failed_step` if present
    - _Requirements: 4.2_
  - [ ]* 11.4 Write property test — Property 10: random query cycles (mocked agents) → `ReasoningTrace` always has all required fields
    - **Property 10: Reasoning trace is structurally complete for every response**
    - **Validates: Requirements 4.1, 4.3**
  - [ ]* 11.5 Write property test — Property 11: random completed queries → `Audit_Log` record `reasoning_trace_json` deserialises to a valid `ReasoningTrace`
    - **Property 11: Reasoning trace is persisted in every audit record**
    - **Validates: Requirements 4.4**
  - [ ]* 11.6 Write property test — Property 12: random queries → `AuditRecord` has all five required fields non-null (`queried_by`, `query_text`, `agents_invoked`, `tables_accessed`, `timestamp`)
    - **Property 12: Audit records contain all required fields**
    - **Validates: Requirements 5.1**
  - [ ]* 11.7 Write property test — Property 13: random `tables_accessed` sets → `pii_access` flag is correct
    - **Property 13: PII flag is set exactly when PII tables are accessed**
    - **Validates: Requirements 5.2**
  - [ ]* 11.8 Write property test — Property 14: random audit record timestamps → `retention_expires_at` >= `timestamp + 90 days`
    - **Property 14: Retention expiry is always at least 90 days in the future**
    - **Validates: Requirements 5.4**
  - [ ]* 11.9 Write unit tests: error injected mid-chain → trace contains `failed_step` and `partial_results`; PII access on Suspects query → `pii_access: true` in audit record
    - _Requirements: 4.5, 5.2_

- [ ] 12. Checkpoint — explainability and audit complete
  - Every response renders the "Why this answer?" panel; every query writes a verifiable audit record. Ensure all tests pass. Ask the user if questions arise.

- [ ] 13. Voice input interface
  - [ ] 13.1 Implement `frontend/src/components/VoiceInput.tsx`
    - Feature-detect `window.SpeechRecognition` at runtime; if absent, render nothing (no error thrown, mic button hidden)
    - When present, render mic button; on click, start recognition with locale from `VoiceInterfaceState.locale` (default `"en-IN"`)
    - On `result` event, set the chat input field value to `transcript` from the first result alternative
    - On `start`, show visual recording indicator; on `end`/`error`, hide it
    - Handle `no-speech` error with a brief toast; swallow all other `onerror` events silently
    - _Requirements: 8.1, 8.2, 8.3, 8.4, 8.5_
  - [ ]* 13.2 Write property test — Property 19: any `SpeechRecognition` instance created by Voice Interface → `lang` ∈ `{ "en-IN", "kn-IN" }`
    - **Property 19: Voice locale is always a supported value**
    - **Validates: Requirements 8.2**
  - [ ]* 13.3 Write property test — Property 20: any `SpeechRecognitionResult` event → input field value equals `transcript`
    - **Property 20: Voice transcript populates the input field**
    - **Validates: Requirements 8.3**
  - [ ]* 13.4 Write property test — Property 21: any Voice UI state → recording indicator DOM presence matches `active` field
    - **Property 21: Voice indicator reflects active state**
    - **Validates: Requirements 8.5**
  - [ ]* 13.5 Write unit test: `window.SpeechRecognition === undefined` → mic button absent in rendered output, no error thrown
    - _Requirements: 8.4_

- [x] 14. Query parsing round-trip validation
  - [x] 14.1 Implement `functions/orchestrator/src/agents/reconstruct.ts`
    - Export a `reconstructQuery(parsed: ParsedIntent & ExtractedEntities): string` function that produces a canonical natural-language query description from a structured representation
    - _Requirements: 11.2_
  - [ ]* 14.2 Write property test — Property 22: random valid query strings → `parse(reconstruct(parse(q))) ≅ parse(q)` (intent types and entity keys are equivalent)
    - **Property 22: Query parsing round-trip**
    - **Validates: Requirements 11.2, 11.3**
  - [ ]* 14.3 Write unit test: reconstructed query description that does not match original intent → discrepancy surfaced in `ReasoningTrace` for developer review
    - _Requirements: 11.4_

- [ ] 15. Network Analysis Agent (P1 — if time allows)
  - [ ] 15.1 Implement `functions/orchestrator/src/agents/networkAnalysis.ts`
    - Execute multi-hop ZCQL joins across `Suspects`, `Cases`, `Locations` tables
    - Assign `hop_distance` to each entity (0 = seed, 1 = direct, 2 = one-hop, etc.)
    - Paginate at 100 entities sorted by `hop_distance` ascending; set `paginated: true` and `total_count` when exceeded
    - Append result to `AgentState.reasoning_trace`
    - _Requirements: 7.1, 7.2, 7.3, 7.4_
  - [ ]* 15.2 Write property test — Property 17: random `NetworkResult` values → all entities have non-negative integer `hop_distance`
    - **Property 17: Network entities always carry a hop distance**
    - **Validates: Requirements 7.2**
  - [ ]* 15.3 Write property test — Property 18: random network analysis queries → `tables_accessed` includes `"Suspects"`, `"Cases"`, and `"Locations"`
    - **Property 18: Network queries span all three entity tables**
    - **Validates: Requirements 7.1**
  - [ ]* 15.4 Write unit test: mock dataset with 150 connected entities → `paginated: true`, `entities.length === 100`, `total_count === 150`
    - _Requirements: 7.4_

- [ ] 16. Catalyst Cron nightly re-indexing job
  - Implement `functions/cron-reindex/src/index.ts` as a Catalyst Cron handler
  - Query `Cases` rows added or updated since the previous run; call Zia on each `narrative`; upsert `MO_Features.zia_entities_json`
  - _Requirements: 9.4_

- [ ] 17. Final checkpoint — full system integration
  - Ensure all non-optional tests pass. Smoke-test the full flow: seed → auth → chat query → LangGraph → ZCQL → Case Linking → Explainability → Audit record written. Ask the user if questions arise.

- [ ] 18. Stretch goal — Twilio IVR voice interface (P2)
  - [ ] 18.1 Implement `functions/ivr/src/index.ts` as a Catalyst Function webhook for Twilio inbound calls
    - Accept Twilio `<Gather>` speech transcription; route through the same LangGraph orchestrator pipeline
    - Return TwiML `<Say>` response with the answer text
    - Log IVR-sourced queries via `audit.ts` with caller identity if available
    - _Requirements: 12.1, 12.2, 12.3, 12.4_

---

## Notes

- Tasks marked with `*` are optional and can be skipped for a faster MVP build
- Build priority order: 2 → 4 → 5+6 → 8 → 9 → 11 → 13 → 14 → 15 → 16 → 18
- All property tests reference their design document property number in a `// Feature: ksp-crime-ai, Property N` comment
- Catalyst Data Store, Auth, and Gemini API are mocked in all unit and property tests; integration tests are tagged `@integration` and excluded from the default CI run
- `JACCARD_THRESHOLD` is read from an env var (default `0.6`) — no hardcoding
- ZCQL templates use parameterised binding only; user input is never string-interpolated into queries

---

## Task Dependency Graph

```json
{
  "waves": [
    {
      "wave": 1,
      "tasks": ["7. Checkpoint — end-to-end query round-trip"]
    },
    {
      "wave": 2,
      "tasks": [
        "8.2 Implement `functions/orchestrator/src/graph.ts`"
      ]
    },
    {
      "wave": 3,
      "tasks": [
        "9.2 Implement `functions/orchestrator/src/agents/caseLinking.ts`"
      ]
    },
    {
      "wave": 4,
      "tasks": ["10. Checkpoint — Case Linking Agent demo"]
    },
    {
      "wave": 5,
      "tasks": [
        "11.1 Implement `functions/orchestrator/src/agents/explainability.ts`",
        "11.2 Implement `functions/orchestrator/src/audit.ts`",
        "11.3 Render the collapsible \"Why this answer?\" panel in `frontend/src/app/page.tsx`",
        "14.1 Implement `functions/orchestrator/src/agents/reconstruct.ts`",
        "15.1 Implement `functions/orchestrator/src/agents/networkAnalysis.ts`",
        "16. Catalyst Cron nightly re-indexing job"
      ]
    },
    {
      "wave": 6,
      "tasks": [
        "11.4 Write property test — Property 10: random query cycles (mocked agents) → `ReasoningTrace` always has all required fields",
        "11.5 Write property test — Property 11: random completed queries → `Audit_Log` record `reasoning_trace_json` deserialises to a valid `ReasoningTrace`",
        "11.6 Write property test — Property 12: random queries → `AuditRecord` has all five required fields non-null (`queried_by`, `query_text`, `agents_invoked`, `tables_accessed`, `timestamp`)",
        "11.7 Write property test — Property 13: random `tables_accessed` sets → `pii_access` flag is correct",
        "11.8 Write property test — Property 14: random audit record timestamps → `retention_expires_at` >= `timestamp + 90 days`",
        "11.9 Write unit tests: error injected mid-chain → trace contains `failed_step` and `partial_results`; PII access on Suspects query → `pii_access: true` in audit record",
        "14.2 Write property test — Property 22: random valid query strings → `parse(reconstruct(parse(q))) ≅ parse(q)` (intent types and entity keys are equivalent)",
        "14.3 Write unit test: reconstructed query description that does not match original intent → discrepancy surfaced in `ReasoningTrace` for developer review",
        "15.2 Write property test — Property 17: random `NetworkResult` values → all entities have non-negative integer `hop_distance`",
        "15.3 Write property test — Property 18: random network analysis queries → `tables_accessed` includes `\"Suspects\"`, `\"Cases\"`, and `\"Locations\"`",
        "15.4 Write unit test: mock dataset with 150 connected entities → `paginated: true`, `entities.length === 100`, `total_count === 150`"
      ]
    },
    {
      "wave": 7,
      "tasks": ["12. Checkpoint — explainability and audit complete"]
    },
    {
      "wave": 8,
      "tasks": ["13.1 Implement `frontend/src/components/VoiceInput.tsx`"]
    },
    {
      "wave": 9,
      "tasks": [
        "13.2 Write property test — Property 19: any `SpeechRecognition` instance created by Voice Interface → `lang` ∈ `{ \"en-IN\", \"kn-IN\" }`",
        "13.3 Write property test — Property 20: any `SpeechRecognitionResult` event → input field value equals `transcript`",
        "13.4 Write property test — Property 21: any Voice UI state → recording indicator DOM presence matches `active` field",
        "13.5 Write unit test: `window.SpeechRecognition === undefined` → mic button absent in rendered output, no error thrown"
      ]
    },
    {
      "wave": 10,
      "tasks": ["17. Final checkpoint — full system integration"]
    },
    {
      "wave": 11,
      "tasks": ["18.1 Implement `functions/ivr/src/index.ts` as a Catalyst Function webhook for Twilio inbound calls"]
    }
  ]
}
```
