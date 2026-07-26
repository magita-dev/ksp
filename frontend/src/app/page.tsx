"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import VoiceInput from "@/components/VoiceInput";
import { CrimeMap } from "@/components/CrimeMap";
import { CaseDatabaseView } from "@/components/CaseDatabaseView";
import { DashboardView } from "@/components/DashboardView";
import { NewCaseModal } from "@/components/NewCaseModal";
import { useAuth } from "@/lib/auth-context";
import { tierLabel } from "@/lib/tiers";
import { generateQueryReportPdf } from "@/lib/pdfExporter";

interface ZiaEntity {
  value: string;
  type: string;
  confidence?: number;
}

interface ReasoningTrace {
  query_parsed?: unknown;
  agents_invoked: string[];
  zcql_filters: string[];
  jaccard_scores: Array<{ case_id: string; score: number; matching_features: string[] }>;
  zia_entities: ZiaEntity[];
  traversal_path?: unknown[];
  failed_step?: string;
  partial_results?: unknown;
}

interface ConversationMessage {
  id: string;
  role: "user" | "assistant";
  text: string;
  reasoning_trace?: ReasoningTrace;
  timestamp: Date;
}

// ─── "Why this answer?" collapsible panel ────────────────────────────────────

function WhyPanel({ trace }: { trace: ReasoningTrace }) {
  const [open, setOpen] = useState(false);

  const hasContent =
    trace.agents_invoked.length > 0 ||
    trace.zcql_filters.length > 0 ||
    trace.jaccard_scores.length > 0 ||
    trace.zia_entities.length > 0 ||
    trace.failed_step;

  if (!hasContent) return null;

  return (
    <div className="mt-sm border-t border-dashed border-outline-variant/40 pt-xs">
      <button
        onClick={() => setOpen((v) => !v)}
        className="text-secondary-fixed text-xs font-label-md font-bold hover:underline flex items-center gap-1 cursor-pointer"
        aria-expanded={open}
      >
        <span className="material-symbols-outlined text-xs">
          {open ? "expand_more" : "chevron_right"}
        </span>
        <span>WHY THIS ANSWER? (REASONING TRACE)</span>
      </button>

      {open && (
        <div className="mt-2 bg-surface-container-low p-sm rounded-lg border border-outline-variant/30 text-xs space-y-sm">
          {trace.failed_step && (
            <div className="text-error flex items-center gap-1">
              <span className="material-symbols-outlined text-xs">warning</span>
              <span>FAILED STEP: <strong>{trace.failed_step}</strong></span>
            </div>
          )}

          {trace.agents_invoked.length > 0 && (
            <div>
              <div className="text-outline uppercase text-[10px] font-bold mb-1">AGENTS INVOKED</div>
              <div className="flex flex-wrap gap-1">
                {trace.agents_invoked.map((agent, i) => (
                  <span key={i} className="bg-primary/20 text-primary border border-primary/30 px-2 py-0.5 rounded text-[11px] font-mono-data">
                    {agent}
                  </span>
                ))}
              </div>
            </div>
          )}

          {trace.zcql_filters.length > 0 && (
            <div>
              <div className="text-outline uppercase text-[10px] font-bold mb-1">FILTERS APPLIED</div>
              <ul className="list-disc list-inside text-on-surface-variant font-mono-data text-[11px]">
                {trace.zcql_filters.map((f, i) => (
                  <li key={i}>{f}</li>
                ))}
              </ul>
            </div>
          )}

          {trace.jaccard_scores.length > 0 && (
            <div>
              <div className="text-outline uppercase text-[10px] font-bold mb-1">PATTERN MATCHES</div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5">
                {trace.jaccard_scores.map((entry, i) => (
                  <div key={i} className="bg-surface-container p-1.5 rounded border border-outline-variant/20 flex flex-col justify-between">
                    <div className="flex justify-between items-center">
                      <span className="font-mono-data font-bold text-primary">{entry.case_id}</span>
                      <span className="text-secondary-fixed font-bold">{Math.round(entry.score * 100)}% MATCH</span>
                    </div>
                    <div className="flex flex-wrap gap-1 mt-1">
                      {entry.matching_features.map((feat, j) => (
                        <span key={j} className="bg-surface-container-high text-on-surface-variant text-[10px] px-1 rounded">
                          {feat}
                        </span>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {trace.zia_entities.length > 0 && (
            <div>
              <div className="text-outline uppercase text-[10px] font-bold mb-1">ENTITIES DETECTED</div>
              <div className="flex flex-wrap gap-1">
                {trace.zia_entities.map((e, i) => (
                  <span key={i} className="bg-secondary-fixed/20 text-secondary-fixed border border-secondary-fixed/30 px-2 py-0.5 rounded text-[11px] font-mono-data flex items-center gap-1">
                    {e.value}
                    <span className="text-[9px] opacity-70 uppercase">({e.type})</span>
                  </span>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function MainPage() {
  const { profile, signOut } = useAuth();
  const [activeTab, setActiveTab] = useState<"query" | "map" | "database" | "dashboard">("query");
  const [isNewCaseModalOpen, setIsNewCaseModalOpen] = useState(false);
  const [caseRefreshTrigger, setCaseRefreshTrigger] = useState(0);

  const [messages, setMessages] = useState<ConversationMessage[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [voiceLocale, setVoiceLocale] = useState<"en-IN" | "kn-IN">("en-IN");

  const messagesEndRef = useRef<HTMLDivElement>(null);

  const scrollToBottom = useCallback(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, []);

  useEffect(() => {
    scrollToBottom();
  }, [messages, loading, scrollToBottom]);

  async function sendQuery(queryText: string) {
    const trimmed = queryText.trim();
    if (!trimmed || loading) return;

    setActiveTab("query");

    const userMsg: ConversationMessage = {
      id: crypto.randomUUID(),
      role: "user",
      text: trimmed,
      timestamp: new Date(),
    };

    setMessages((prev) => [...prev, userMsg]);
    setInput("");
    setLoading(true);

    try {
      const res = await fetch("/api/query", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ query_text: trimmed }),
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || "Request failed");
      }

      const assistantMsg: ConversationMessage = {
        id: crypto.randomUUID(),
        role: "assistant",
        text: data.answer || "No response received.",
        reasoning_trace: data.reasoning_trace,
        timestamp: new Date(),
      };

      setMessages((prev) => [...prev, assistantMsg]);
    } catch (err) {
      const errorMsg: ConversationMessage = {
        id: crypto.randomUUID(),
        role: "assistant",
        text: err instanceof Error ? err.message : "An error occurred while running orchestrator graph.",
        timestamp: new Date(),
      };
      setMessages((prev) => [...prev, errorMsg]);
    } finally {
      setLoading(false);
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    await sendQuery(input);
  }

  const sampleQueries = [
    "Show burglary cases in Bengaluru last month",
    "Cases similar to KSP-2024-001",
    "Show connections for suspect S-001 and other cases",
    "ಬೆಂಗಳೂರಿನಲ್ಲಿ ಕಳ್ಳತನ ಪ್ರಕರಣಗಳು",
  ];

  return (
    <div className="bg-surface text-on-surface min-h-screen flex flex-col font-body-md relative overflow-x-hidden">
      {/* Background Grid */}
      <div className="fixed inset-0 tactical-grid pointer-events-none z-0"></div>

      {/* Top Navigation Bar */}
      <header className="flex items-center justify-between px-margin w-full h-16 border-b border-outline-variant bg-surface-container z-50 sticky top-0 backdrop-blur-md">
        <div className="flex items-center gap-md">
          <div className="flex items-center gap-xs">
            <div className="w-10 h-10 relative">
              <img
                className="w-full h-full object-contain filter drop-shadow-[0_0_8px_rgba(179,197,255,0.4)]"
                alt="KSP Emblem"
                src="https://lh3.googleusercontent.com/aida-public/AB6AXuCPiZg5ez2r1VPGNoYa1i9zfRzCRYKwjHfNBQv_FlcD3R293qI4biq6xGcSj5U2SSuF2LjMz8e4gOtVYMbRoRUc35QOu5TGZA7X8mjHk44-EJvaBqx0DExOYruLAcKnU-v2wmIVlw2StawqPsSz0n7SYyYncDVM5Yj8J0JYssLAS0q3h171AXAqguJVTQI6Oj7uLezl3V0vESSYeZNrgHr1e_Lzzf1Apquhxk6RgxDy5kBXyK9XA1q_jiSisFRGk5-2sZ-B1CPVd3TJ"
              />
            </div>
            <div>
              <span className="font-label-md text-label-md tracking-widest text-primary block leading-none">
                KARNATAKA STATE POLICE
              </span>
              <span className="font-mono-data text-[10px] text-secondary-fixed tracking-wider block mt-0.5">
                CRIME GRAPH AI & GIS ORCHESTRATOR
              </span>
            </div>
          </div>
        </div>

        {profile && (
          <div className="flex items-center gap-md">
            <div className="hidden sm:flex flex-col items-end">
              <span className="font-label-md text-label-md font-bold text-on-surface">{profile.full_name}</span>
              <span className="font-mono-data text-[11px] text-secondary-fixed">
                {tierLabel(profile.tier)} · BADGE: {profile.badge_number}
              </span>
            </div>

            <button
              suppressHydrationWarning
              onClick={() => setIsNewCaseModalOpen(true)}
              className="bg-primary text-on-primary hover:bg-primary/90 font-bold px-md py-sm rounded text-xs font-label-md uppercase tracking-wider flex items-center gap-1 cursor-pointer"
            >
              <span className="material-symbols-outlined text-sm">add_box</span>
              <span className="hidden sm:inline">LOG NEW FIR</span>
            </button>

            <button
              suppressHydrationWarning
              onClick={() => signOut()}
              className="border border-outline-variant text-on-surface-variant hover:text-on-surface hover:bg-surface-container-high p-sm rounded text-xs font-label-md flex items-center gap-1 cursor-pointer"
              title="Sign Out"
            >
              <span className="material-symbols-outlined text-sm">logout</span>
            </button>
          </div>
        )}
      </header>

      {/* Tabs Navigation */}
      <div className="w-full bg-surface-container-low border-b border-outline-variant/40 px-margin flex items-center justify-between overflow-x-auto z-40">
        <div className="flex items-center gap-xs py-1">
          <button
            suppressHydrationWarning
            onClick={() => setActiveTab("query")}
            className={`px-md py-2 text-xs font-label-md uppercase tracking-wider rounded-lg flex items-center gap-1.5 transition-all cursor-pointer ${
              activeTab === "query"
                ? "bg-primary text-on-primary font-bold shadow-[0_0_12px_rgba(179,197,255,0.3)]"
                : "text-on-surface-variant hover:text-on-surface hover:bg-surface-container-high"
            }`}
          >
            <span className="material-symbols-outlined text-sm">smart_toy</span>
            <span>AI ORCHESTRATOR</span>
          </button>

          <button
            suppressHydrationWarning
            onClick={() => setActiveTab("map")}
            className={`px-md py-2 text-xs font-label-md uppercase tracking-wider rounded-lg flex items-center gap-1.5 transition-all cursor-pointer ${
              activeTab === "map"
                ? "bg-primary text-on-primary font-bold shadow-[0_0_12px_rgba(179,197,255,0.3)]"
                : "text-on-surface-variant hover:text-on-surface hover:bg-surface-container-high"
            }`}
          >
            <span className="material-symbols-outlined text-sm">map</span>
            <span>GIS HEATMAP</span>
          </button>

          <button
            suppressHydrationWarning
            onClick={() => setActiveTab("database")}
            className={`px-md py-2 text-xs font-label-md uppercase tracking-wider rounded-lg flex items-center gap-1.5 transition-all cursor-pointer ${
              activeTab === "database"
                ? "bg-primary text-on-primary font-bold shadow-[0_0_12px_rgba(179,197,255,0.3)]"
                : "text-on-surface-variant hover:text-on-surface hover:bg-surface-container-high"
            }`}
          >
            <span className="material-symbols-outlined text-sm">folder_open</span>
            <span>FIR CASE EXPLORER</span>
          </button>

          <button
            suppressHydrationWarning
            onClick={() => setActiveTab("dashboard")}
            className={`px-md py-2 text-xs font-label-md uppercase tracking-wider rounded-lg flex items-center gap-1.5 transition-all cursor-pointer ${
              activeTab === "dashboard"
                ? "bg-primary text-on-primary font-bold shadow-[0_0_12px_rgba(179,197,255,0.3)]"
                : "text-on-surface-variant hover:text-on-surface hover:bg-surface-container-high"
            }`}
          >
            <span className="material-symbols-outlined text-sm">analytics</span>
            <span>CRIME DASHBOARD</span>
          </button>
        </div>

        <div className="hidden lg:flex items-center gap-2 font-mono-data text-[11px] text-secondary-fixed">
          <span className="w-2 h-2 rounded-full bg-secondary-fixed biometric-pulse"></span>
          <span>SYSTEM ONLINE · ZCQL & GRAPH INDEX ACTIVE</span>
        </div>
      </div>

      {/* Main View Area */}
      <main className="flex-grow p-margin max-w-7xl w-full mx-auto relative z-10 flex flex-col">
        {activeTab === "query" && (
          <div className="flex flex-col h-[calc(100vh-170px)] min-h-[500px]">
            {/* Conversation Messages List */}
            <div className="flex-grow overflow-y-auto custom-scrollbar p-sm space-y-md">
              {messages.length === 0 && (
                <div className="my-auto max-w-2xl mx-auto glass-panel p-lg rounded-xl border border-outline-variant/30 text-center space-y-md">
                  <div className="w-12 h-12 rounded-full bg-primary/20 text-primary mx-auto flex items-center justify-center">
                    <span className="material-symbols-outlined text-2xl">policy</span>
                  </div>
                  <div>
                    <h2 className="font-headline-md text-headline-md font-bold text-primary">
                      KARNATAKA POLICE INTELLIGENCE AGENT
                    </h2>
                    <p className="font-body-sm text-on-surface-variant mt-1">
                      Query crimes, suspect networks, MO patterns, and regional trends using natural language in English or Kannada.
                    </p>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-sm pt-2">
                    {sampleQueries.map((q, idx) => (
                      <button
                        key={idx}
                        type="button"
                        onClick={() => sendQuery(q)}
                        className="p-sm bg-surface-container-low hover:bg-surface-container-high border border-outline-variant/30 text-on-surface rounded-lg text-left text-xs font-mono-data flex items-center gap-2 transition-all cursor-pointer"
                      >
                        <span className="material-symbols-outlined text-primary text-sm">search</span>
                        <span className="truncate">{q}</span>
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {messages.map((msg, index) => {
                const prevMsg = index > 0 ? messages[index - 1] : null;
                const userQueryText =
                  msg.role === "assistant" && prevMsg?.role === "user"
                    ? prevMsg.text
                    : "KSP Intelligence Search";

                return (
                  <div
                    key={msg.id}
                    className={`flex ${
                      msg.role === "user" ? "justify-end" : "justify-start"
                    }`}
                  >
                    <div
                      className={`max-w-[85%] sm:max-w-[75%] p-md rounded-xl space-y-sm shadow-md ${
                        msg.role === "user"
                          ? "bg-primary text-on-primary rounded-tr-none"
                          : "glass-card text-on-surface border border-outline-variant/40 rounded-tl-none"
                      }`}
                    >
                      <div className="flex items-center justify-between text-[10px] font-mono-data opacity-70 uppercase tracking-wider">
                        <span>
                          {msg.role === "user"
                            ? "INVESTIGATING OFFICER"
                            : "KSP GRAPH ORCHESTRATOR"}
                        </span>
                        <span>{msg.timestamp.toLocaleTimeString()}</span>
                      </div>

                      <div className="font-body-md text-body-md whitespace-pre-wrap leading-relaxed">
                        {msg.text}
                      </div>

                      {msg.role === "assistant" && (
                        <div className="pt-2 border-t border-outline-variant/20 flex flex-wrap items-center justify-between gap-sm">
                          <button
                            onClick={() =>
                              generateQueryReportPdf(
                                userQueryText,
                                msg.text,
                                profile?.full_name
                              )
                            }
                            className="py-1 px-2.5 bg-primary/10 border border-primary/30 text-primary hover:bg-primary/20 rounded text-xs font-label-md uppercase tracking-wider flex items-center gap-1 cursor-pointer"
                          >
                            <span className="material-symbols-outlined text-xs">picture_as_pdf</span>
                            <span>EXPORT REPORT PDF</span>
                          </button>
                        </div>
                      )}

                      {msg.reasoning_trace && (
                        <WhyPanel trace={msg.reasoning_trace} />
                      )}
                    </div>
                  </div>
                );
              })}

              {loading && (
                <div className="flex justify-start">
                  <div className="glass-card p-md rounded-xl rounded-tl-none border border-outline-variant/40 flex items-center gap-sm">
                    <span className="material-symbols-outlined animate-spin text-primary">
                      progress_activity
                    </span>
                    <span className="font-mono-data text-xs text-secondary-fixed">
                      TRAVERSING CRIME GRAPH & EXECUTING ZCQL FILTERS...
                    </span>
                  </div>
                </div>
              )}

              <div ref={messagesEndRef} />
            </div>

            {/* Input Form */}
            <form
              suppressHydrationWarning
              onSubmit={handleSubmit}
              className="mt-sm glass-panel p-sm rounded-xl border border-outline-variant/40 flex items-center gap-sm shadow-xl"
            >
              <input
                type="text"
                value={input}
                onChange={(e) => setInput(e.target.value)}
                placeholder={`Query crime graph in ${
                  voiceLocale === "kn-IN" ? "Kannada (ಕನ್ನಡ)" : "English"
                }...`}
                className="flex-grow bg-surface-container-highest/30 border-b border-outline-variant px-sm py-2 font-body-md text-on-surface focus:border-primary focus:outline-none"
                disabled={loading}
                suppressHydrationWarning
              />

              <button
                suppressHydrationWarning
                type="button"
                onClick={() =>
                  setVoiceLocale((prev) => (prev === "en-IN" ? "kn-IN" : "en-IN"))
                }
                className="px-2.5 py-2 bg-surface-container-high border border-outline-variant/40 rounded text-xs font-mono-data text-secondary-fixed hover:bg-surface-container-highest cursor-pointer whitespace-nowrap"
                title={`Voice recognition language: ${voiceLocale}. Click to switch.`}
              >
                {voiceLocale === "en-IN" ? "🇬🇧 EN" : "🇮🇳 KN (ಕನ್ನಡ)"}
              </button>

              <VoiceInput
                onTranscript={(transcript) => sendQuery(transcript)}
                locale={voiceLocale}
                disabled={loading}
              />

              <button
                suppressHydrationWarning
                type="submit"
                disabled={loading || !input.trim()}
                className="bg-primary text-on-primary px-lg py-2 rounded font-bold font-label-md text-xs uppercase tracking-wider hover:bg-primary/90 cursor-pointer disabled:opacity-50 flex items-center gap-1 shadow"
              >
                <span>SEND</span>
                <span className="material-symbols-outlined text-sm">send</span>
              </button>
            </form>
          </div>
        )}

        {activeTab === "map" && (
          <CrimeMap
            onQueryCase={(query) => sendQuery(query)}
            officerName={profile?.full_name}
            badgeNumber={profile?.badge_number}
            tier={profile?.tier}
            refreshTrigger={caseRefreshTrigger}
          />
        )}

        {activeTab === "database" && (
          <CaseDatabaseView
            onOpenNewCaseModal={() => setIsNewCaseModalOpen(true)}
            onQueryCaseInOrchestrator={(q) => sendQuery(q)}
            officerName={profile?.full_name}
            badgeNumber={profile?.badge_number}
            tier={profile?.tier}
            refreshTrigger={caseRefreshTrigger}
          />
        )}

        {activeTab === "dashboard" && (
          <DashboardView
            onQueryCaseInOrchestrator={(q) => sendQuery(q)}
            refreshTrigger={caseRefreshTrigger}
          />
        )}
      </main>

      {/* New Case Entry Modal */}
      <NewCaseModal
        isOpen={isNewCaseModalOpen}
        onClose={() => setIsNewCaseModalOpen(false)}
        onCaseAdded={() => {
          setCaseRefreshTrigger((prev) => prev + 1);
          setActiveTab("database");
        }}
      />
    </div>
  );
}
