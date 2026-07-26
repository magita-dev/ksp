# Requirements Document

## Introduction

The KSP Crime AI is an intelligent conversational platform built on top of the Karnataka State Police crime database (CCTNS/NAFIS/ICJS data). It provides investigators with a natural-language interface to query structured crime data, discover linked cases through MO-based pattern matching, and receive fully explainable, audited responses. The system runs entirely on Zoho Catalyst, using LangGraph-orchestrated multi-agent chains, Gemini for reasoning, and Catalyst Data Store for structured crime data.

The platform is designed so investigators can verify AI reasoning at every step — not blindly trust it. Every response surfaces its evidence trail, and every query is logged for DPDP Act compliance.

---

## Glossary

- **System**: The KSP Crime AI platform as a whole
- **Investigator**: An authenticated KSP officer using the platform to query crime data
- **Router**: The Query Understanding and Routing agent — first agent in the chain
- **Structured_Query_Agent**: The agent that converts parsed intent into ZCQL and queries Catalyst Data Store
- **Case_Linking_Agent**: The agent that computes Jaccard similarity across MO features and surfaces related cases
- **Network_Analysis_Agent**: The agent that traverses relational graphs across suspects, cases, and locations
- **Explainability_Layer**: The formatting step that compiles reasoning traces into a human-readable response with a collapsible "Why this answer?" panel
- **Audit_Logger**: The Catalyst Auth-backed component that records who queried what data, and when
- **Zia_Enricher**: The Catalyst Zia Text Analytics integration that extracts entities and keyphrases from case narratives
- **LangGraph_Orchestrator**: The LangGraph runtime hosted inside a Catalyst Advanced I/O Function that sequences agent calls
- **Voice_Interface**: The client-side Web Speech API integration that transcribes microphone input into text queries
- **MO_Features**: Modus Operandi features — entry method, time of day, weapon type, victim age group, target type
- **ZCQL**: Zoho Catalyst Query Language used to query Catalyst Data Store
- **Reasoning_Trace**: The step-by-step record of query parsing, data retrieval, and pattern matching decisions made during a response
- **DPDP_Act**: India's Digital Personal Data Protection Act — mandates data access logging and auditability
- **Jaccard_Similarity**: Set-based similarity score computed as intersection over union of MO feature sets
- **IVR**: Interactive Voice Response — telephone-based input path via Twilio (stretch goal)

---

## Requirements

### Requirement 1: Natural Language Query Interface

**User Story:** As an Investigator, I want to ask questions about crime data in plain English or basic Kannada, so that I can retrieve case information without knowing database query syntax.

#### Acceptance Criteria

1. THE Router SHALL accept free-text queries in English and basic Kannada via the chat interface.
2. WHEN a query is submitted, THE Router SHALL extract intent (e.g. case lookup, suspect search, pattern query) and named entities (e.g. location, date range, crime type) from the input.
3. WHEN entity extraction produces ambiguous results, THE Router SHALL ask the Investigator a single clarifying question before routing.
4. THE Router SHALL route each parsed query to exactly one or more downstream agents based on identified intent.
5. IF the Router cannot determine a valid intent from the input, THEN THE Router SHALL return a message explaining what kinds of questions the system can answer.

---

### Requirement 2: Structured Crime Data Query

**User Story:** As an Investigator, I want the system to translate my natural language question into a structured database query, so that I get accurate, data-grounded answers from the crime database.

#### Acceptance Criteria

1. WHEN the Router routes a structured query intent, THE Structured_Query_Agent SHALL convert the parsed intent and entities into a valid ZCQL query.
2. THE Structured_Query_Agent SHALL execute the generated ZCQL query against Catalyst Data Store and return the result set.
3. IF the generated ZCQL query returns zero results, THEN THE Structured_Query_Agent SHALL return a response indicating no matching records were found, along with the filters applied.
4. IF the ZCQL query execution fails due to a data store error, THEN THE Structured_Query_Agent SHALL log the error and return a descriptive failure message to the Investigator.
5. THE Structured_Query_Agent SHALL never expose raw ZCQL syntax in the Investigator-facing response.

---

### Requirement 3: Case Linking and MO Pattern Matching

**User Story:** As an Investigator, I want the system to surface cases with similar modus operandi, so that I can identify potential serial offenders or related crime patterns I might otherwise miss.

#### Acceptance Criteria

1. WHEN a case is provided or retrieved, THE Case_Linking_Agent SHALL compute Jaccard similarity scores between the case's MO_Features and all other cases in the database.
2. THE Case_Linking_Agent SHALL surface cases whose Jaccard similarity score meets or exceeds a configurable threshold (default: 0.6).
3. THE Zia_Enricher SHALL extract entities and keyphrases from free-text case narratives and provide them as additional features to the Case_Linking_Agent.
4. THE Case_Linking_Agent SHALL present similar cases as "potential pattern matches for investigator review" and SHALL NOT assert that the same offender committed multiple crimes.
5. IF no cases meet the similarity threshold, THEN THE Case_Linking_Agent SHALL inform the Investigator that no sufficiently similar cases were found.
6. THE Case_Linking_Agent SHALL include the Jaccard score and the matching MO_Features in the output for each surfaced match.

---

### Requirement 4: Explainability and Reasoning Transparency

**User Story:** As an Investigator, I want to see how the system reached its answer, so that I can verify the reasoning before acting on it.

#### Acceptance Criteria

1. THE Explainability_Layer SHALL compile a Reasoning_Trace for every response, covering: query parsed, agents invoked, data queried, and pattern matches found.
2. THE System SHALL render the Reasoning_Trace as a collapsible "Why this answer?" panel in the chat UI.
3. THE Explainability_Layer SHALL include the specific ZCQL filters applied, the Jaccard scores computed, and the Zia-extracted entities used, within the Reasoning_Trace.
4. THE Reasoning_Trace SHALL be stored alongside the response in the Audit_Logger for post-hoc review.
5. IF an agent in the chain encounters an error, THEN THE Explainability_Layer SHALL indicate which step failed and what was returned up to that point.

---

### Requirement 5: Audit Trail and DPDP Act Compliance

**User Story:** As a KSP administrator, I want every data access event to be logged against the authenticated officer's identity, so that we comply with DPDP Act requirements and can investigate misuse.

#### Acceptance Criteria

1. THE Audit_Logger SHALL record the Investigator's authenticated identity, the query text, the agents invoked, the data tables accessed, and the timestamp for every query.
2. WHEN a query touches personally identifiable data (e.g. suspect name, victim details), THE Audit_Logger SHALL flag the record as a PII-access event.
3. THE System SHALL deny access to the query interface to any unauthenticated session via Catalyst Authentication.
4. THE Audit_Logger SHALL retain audit records for a minimum of 90 days.
5. WHERE an administrative review interface is available, THE System SHALL allow authorised administrators to search and export audit records by date range, officer identity, or data table accessed.

---

### Requirement 6: Multi-Agent Orchestration

**User Story:** As a developer, I want the agents to be orchestrated by LangGraph inside a Catalyst Advanced I/O Function, so that multi-step reasoning chains complete within the platform's execution constraints.

#### Acceptance Criteria

1. THE LangGraph_Orchestrator SHALL sequence agent calls (Router → Structured_Query_Agent, Case_Linking_Agent, Network_Analysis_Agent) as a directed graph based on parsed intent.
2. THE LangGraph_Orchestrator SHALL run entirely inside a Catalyst Advanced I/O Function to support execution times required by multi-agent chains.
3. IF an agent node in the LangGraph graph returns an error state, THEN THE LangGraph_Orchestrator SHALL halt the chain and surface the partial result with an error annotation.
4. THE LangGraph_Orchestrator SHALL pass the full Reasoning_Trace context between agent nodes so each agent can append its step to the trace.
5. THE System SHALL invoke Gemini as the LLM reasoning layer from within the Catalyst Function, and SHALL NOT call Gemini directly from client-side code.

---

### Requirement 7: Network and Relational Analysis

**User Story:** As an Investigator, I want to explore relationships between suspects, cases, and locations, so that I can map criminal networks beyond a single case.

#### Acceptance Criteria

1. WHEN an Investigator queries connections between entities (suspect, location, or case), THE Network_Analysis_Agent SHALL execute relational ZCQL queries across the suspects, cases, and locations tables in Catalyst Data Store.
2. THE Network_Analysis_Agent SHALL return the degree of connection (e.g. direct link, one-hop, two-hop) for each entity in the result.
3. THE Network_Analysis_Agent SHALL include the result in the Reasoning_Trace so the Explainability_Layer can render the traversal path.
4. IF a network query would return more than 100 connected entities, THEN THE Network_Analysis_Agent SHALL paginate the results and inform the Investigator that additional results are available.

---

### Requirement 8: Voice Input

**User Story:** As an Investigator, I want to speak my query aloud instead of typing, so that I can use the system hands-free or more quickly in the field.

#### Acceptance Criteria

1. THE Voice_Interface SHALL provide a microphone icon in the chat UI that, when activated, captures audio via the Web Speech API.
2. THE Voice_Interface SHALL support en-IN and kn-IN locale settings for speech recognition.
3. WHEN speech recognition produces a transcript, THE Voice_Interface SHALL populate the chat input field with the transcript and allow the Investigator to review it before submitting.
4. IF the browser does not support the Web Speech API, THEN THE Voice_Interface SHALL hide the microphone icon and display no error.
5. WHEN the Voice_Interface is active, THE System SHALL display a visual indicator showing that audio capture is in progress.

---

### Requirement 9: Frontend and Platform Deployment

**User Story:** As a developer, I want the frontend deployed via Catalyst Slate and all backend components on Catalyst, so that the entire system runs within the mandatory Zoho Catalyst platform.

#### Acceptance Criteria

1. THE System SHALL deploy the Next.js frontend via Catalyst Slate using the Starter Template Gallery as the base.
2. THE System SHALL host all orchestration logic, LLM calls, and ZCQL queries inside Catalyst Advanced I/O Functions.
3. THE System SHALL store all structured crime data in Catalyst Data Store with a relational schema covering cases, suspects, victims, locations, and MO features.
4. WHERE nightly re-indexing or batch processing is required, THE System SHALL schedule the job using Catalyst Cron.
5. THE System SHALL use Catalyst Authentication as the sole authentication provider and SHALL NOT implement a custom auth system.

---

### Requirement 10: Data Availability and Synthetic Dataset

**User Story:** As a developer, I want a usable crime dataset available from day one, so that the system can be demonstrated end-to-end even before official organiser data is provided.

#### Acceptance Criteria

1. THE System SHALL include a synthetic dataset covering at minimum: cases, suspects, victims, locations, and MO features, loadable into Catalyst Data Store via a seed script.
2. THE System SHALL generate the synthetic dataset in a schema-compatible format so it can be replaced by organiser-provided data without application code changes.
3. WHEN the synthetic dataset is loaded, THE Structured_Query_Agent SHALL be able to answer a representative set of test queries covering all supported intent types.
4. THE System SHALL document the data schema so the organiser's actual dataset can be mapped to it.

---

### Requirement 11: Round-Trip Query Parsing

**User Story:** As a developer, I want the natural language query parsing to be verifiable end-to-end, so that I can confirm the system correctly interprets and reconstructs queries without information loss.

#### Acceptance Criteria

1. THE Router SHALL parse a natural language query into a structured intent-and-entity representation.
2. THE Structured_Query_Agent SHALL be able to reconstruct a canonical query description from the structured representation.
3. FOR ALL valid natural language queries, parsing then reconstructing then parsing SHALL produce an equivalent structured representation (round-trip property).
4. IF the reconstructed query description does not match the original intent, THEN THE System SHALL surface this discrepancy in the Reasoning_Trace for developer review.

---

### Requirement 12: Stretch Goal — IVR Voice Interface

**User Story:** As an Investigator in the field, I want to call a phone number and speak my query, so that I can access the system without a screen or internet connection on a device.

#### Acceptance Criteria

1. WHERE the IVR interface is enabled, THE System SHALL accept inbound calls via a Twilio IVR number and transcribe the caller's speech.
2. WHERE the IVR interface is enabled, THE System SHALL route the transcribed query through the same LangGraph_Orchestrator pipeline used by the chat interface.
3. WHERE the IVR interface is enabled, THE System SHALL read the response text back to the caller via Twilio's text-to-speech capability.
4. WHERE the IVR interface is enabled, THE Audit_Logger SHALL log IVR-sourced queries with the caller's authenticated identity, if available.
