"use client";

import React, { useState, useEffect } from "react";
import { generateCasePdf } from "@/lib/pdfExporter";

interface Location {
  district: string;
  taluk?: string;
  village_or_area: string;
}

interface CaseItem {
  case_id: string;
  title: string;
  crime_type: string;
  status: string;
  filed_date: string;
  narrative: string;
  location: Location;
  mo_features?: {
    entry_method?: string;
    time_of_day?: string;
    weapon_type?: string;
    target_type?: string;
  };
  suspects?: string[];
}

interface CaseDatabaseViewProps {
  onOpenNewCaseModal: () => void;
  onQueryCaseInOrchestrator: (query: string) => void;
  officerName?: string;
  badgeNumber?: string;
  tier?: string;
  refreshTrigger?: number;
}

export function CaseDatabaseView({
  onOpenNewCaseModal,
  onQueryCaseInOrchestrator,
  officerName,
  badgeNumber,
  tier,
  refreshTrigger,
}: CaseDatabaseViewProps) {
  const [cases, setCases] = useState<CaseItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [crimeFilter, setCrimeFilter] = useState("all");
  const [districtFilter, setDistrictFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState("all");

  const [stats, setStats] = useState({
    total: 0,
    open: 0,
    under_investigation: 0,
    closed: 0,
  });

  async function fetchCases() {
    try {
      setLoading(true);
      const queryParams = new URLSearchParams();
      if (search) queryParams.set("search", search);
      if (crimeFilter !== "all") queryParams.set("crime_type", crimeFilter);
      if (districtFilter !== "all") queryParams.set("district", districtFilter);
      if (statusFilter !== "all") queryParams.set("status", statusFilter);

      const res = await fetch(`/api/cases?${queryParams.toString()}`);
      const data = await res.json();
      let apiCases: CaseItem[] = data.cases || [];

      // Merge with custom FIRs stored in localStorage
      try {
        const localCustom: CaseItem[] = JSON.parse(localStorage.getItem("ksp_custom_firs") || "[]");
        const existingIds = new Set(apiCases.map((c) => c.case_id));
        const newFromLocal = localCustom.filter((c) => !existingIds.has(c.case_id));

        // Filter local custom cases by search/district/crime/status if needed
        let filteredLocal = newFromLocal;
        if (crimeFilter !== "all") {
          filteredLocal = filteredLocal.filter((c) => String(c.crime_type).toLowerCase() === crimeFilter.toLowerCase());
        }
        if (districtFilter !== "all") {
          filteredLocal = filteredLocal.filter((c) => String(c.location?.district).toLowerCase() === districtFilter.toLowerCase());
        }
        if (statusFilter !== "all") {
          filteredLocal = filteredLocal.filter((c) => String(c.status).toLowerCase() === statusFilter.toLowerCase());
        }
        if (search) {
          const q = search.toLowerCase();
          filteredLocal = filteredLocal.filter(
            (c) =>
              String(c.case_id).toLowerCase().includes(q) ||
              String(c.title).toLowerCase().includes(q) ||
              String(c.narrative).toLowerCase().includes(q) ||
              String(c.location?.village_or_area || "").toLowerCase().includes(q)
          );
        }

        apiCases = [...filteredLocal, ...apiCases];
      } catch (e) {
        console.error("Error reading custom FIRs from localStorage:", e);
      }

      setCases(apiCases);

      // Calculate stats
      setStats({
        total: apiCases.length,
        open: apiCases.filter((c) => c.status === "open").length,
        under_investigation: apiCases.filter((c) => c.status === "under_investigation").length,
        closed: apiCases.filter((c) => c.status === "closed").length,
      });
    } catch (err) {
      console.error("Error fetching cases:", err);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    fetchCases();
  }, [search, crimeFilter, districtFilter, statusFilter, refreshTrigger]);

  return (
    <div className="space-y-gutter">
      {/* Top Stat Ribbon & New Case CTA */}
      <div className="glass-card p-gutter rounded-xl flex flex-col md:flex-row justify-between items-start md:items-center gap-md">
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-sm w-full md:w-auto">
          <div className="bg-surface-container-low p-sm rounded-lg border border-outline-variant/30 flex flex-col">
            <span className="font-headline-md text-headline-md font-bold text-primary">{stats.total}</span>
            <span className="font-label-md text-label-md text-on-surface-variant uppercase">TOTAL FIRs</span>
          </div>

          <div className="bg-surface-container-low p-sm rounded-lg border-l-4 border-error border-outline-variant/30 flex flex-col">
            <span className="font-headline-md text-headline-md font-bold text-error">{stats.open}</span>
            <span className="font-label-md text-label-md text-on-surface-variant uppercase">OPEN CASES</span>
          </div>

          <div className="bg-surface-container-low p-sm rounded-lg border-l-4 border-secondary-fixed border-outline-variant/30 flex flex-col">
            <span className="font-headline-md text-headline-md font-bold text-secondary-fixed">
              {stats.under_investigation}
            </span>
            <span className="font-label-md text-label-md text-on-surface-variant uppercase">INVESTIGATING</span>
          </div>

          <div className="bg-surface-container-low p-sm rounded-lg border-l-4 border-green-400 border-outline-variant/30 flex flex-col">
            <span className="font-headline-md text-headline-md font-bold text-green-400">{stats.closed}</span>
            <span className="font-label-md text-label-md text-on-surface-variant uppercase">RESOLVED</span>
          </div>
        </div>

        <button
          onClick={onOpenNewCaseModal}
          className="w-full md:w-auto bg-primary text-on-primary font-bold px-lg py-md rounded-lg uppercase tracking-wider hover:bg-primary/90 flex items-center justify-center gap-sm active:scale-95 transition-all cursor-pointer shadow-lg"
        >
          <span className="material-symbols-outlined">add_box</span>
          <span>LOG NEW FIR CASE</span>
        </button>
      </div>

      {/* Filter Bar */}
      <div className="glass-card p-sm rounded-xl flex flex-wrap gap-sm items-center">
        <div className="relative flex-grow min-w-[240px]">
          <span className="material-symbols-outlined absolute left-3 top-1/2 -translate-y-1/2 text-outline">
            search
          </span>
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search by Case ID, Title, Location, or MO Keyword..."
            className="w-full bg-surface-container-highest/40 border border-outline-variant/40 py-2 pl-10 pr-3 rounded-lg font-mono-data text-body-sm text-on-surface focus:outline-none focus:border-primary"
          />
        </div>

        <select
          value={crimeFilter}
          onChange={(e) => setCrimeFilter(e.target.value)}
          className="bg-surface-container-highest/40 border border-outline-variant/40 p-2 rounded-lg font-mono-data text-body-sm text-on-surface focus:outline-none"
        >
          <option value="all">ALL CRIME TYPES</option>
          <option value="burglary">BURGLARY</option>
          <option value="robbery">ROBBERY</option>
          <option value="fraud">FRAUD / CYBER</option>
          <option value="theft">THEFT</option>
          <option value="cheating">CHEATING</option>
        </select>

        <select
          value={districtFilter}
          onChange={(e) => setDistrictFilter(e.target.value)}
          className="bg-surface-container-highest/40 border border-outline-variant/40 p-2 rounded-lg font-mono-data text-body-sm text-on-surface focus:outline-none"
        >
          <option value="all">ALL DISTRICTS</option>
          <option value="Bengaluru Urban">BENGALURU URBAN</option>
          <option value="Mysuru">MYSURU</option>
          <option value="Dharwad">DHARWAD</option>
          <option value="Belagavi">BELAGAVI</option>
          <option value="Kalaburagi">KALABURAGI</option>
          <option value="Tumkuru">TUMKURU</option>
        </select>

        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
          className="bg-surface-container-highest/40 border border-outline-variant/40 p-2 rounded-lg font-mono-data text-body-sm text-on-surface focus:outline-none"
        >
          <option value="all">ALL STATUSES</option>
          <option value="open">OPEN</option>
          <option value="under_investigation">UNDER INVESTIGATION</option>
          <option value="closed">CLOSED</option>
        </select>
      </div>

      {/* Cases Grid */}
      {loading ? (
        <div className="glass-card p-xl text-center text-on-surface-variant rounded-xl flex items-center justify-center gap-2">
          <span className="material-symbols-outlined animate-spin text-primary">progress_activity</span>
          <span>LOADING KARNATAKA POLICE CASE DATABASE...</span>
        </div>
      ) : cases.length === 0 ? (
        <div className="glass-card p-xl text-center text-on-surface-variant rounded-xl">
          No cases matched your search filters.
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-gutter">
          {cases.map((c) => (
            <div
              key={c.case_id}
              className="glass-card p-gutter rounded-xl flex flex-col gap-sm hover:border-primary/50 transition-all border border-outline-variant/30 group"
            >
              <div className="flex justify-between items-center">
                <span className="font-mono-data text-xs bg-primary-container text-on-primary-container px-2 py-0.5 rounded font-bold">
                  {c.case_id}
                </span>
                <span
                  className={`font-label-md text-[10px] px-2 py-0.5 rounded uppercase font-bold ${
                    c.status === "open"
                      ? "bg-error-container text-on-error-container"
                      : c.status === "closed"
                      ? "bg-green-950 text-green-300"
                      : "bg-surface-container-high text-secondary-fixed"
                  }`}
                >
                  {c.status.replace("_", " ").toUpperCase()}
                </span>
              </div>

              <h4 className="font-headline-md text-body-lg font-bold text-on-surface group-hover:text-primary transition-colors">
                {c.title}
              </h4>

              <p className="font-mono-data text-xs text-secondary-fixed">
                📍 {c.location?.village_or_area}, {c.location?.district} · Filed: {c.filed_date.slice(0, 10)}
              </p>

              <div className="flex flex-wrap gap-1">
                <span className="font-mono-data text-[11px] bg-surface-container-high px-2 py-0.5 rounded text-on-surface-variant">
                  🔑 {c.mo_features?.entry_method || "forced_door"}
                </span>
                <span className="font-mono-data text-[11px] bg-surface-container-high px-2 py-0.5 rounded text-on-surface-variant">
                  ⏰ {c.mo_features?.time_of_day || "night"}
                </span>
                <span className="font-mono-data text-[11px] bg-surface-container-high px-2 py-0.5 rounded text-on-surface-variant">
                  🏢 {c.mo_features?.target_type || "residential"}
                </span>
              </div>

              <p className="font-body-sm text-xs text-on-surface-variant line-clamp-3 my-1">
                {c.narrative}
              </p>

              {c.suspects && c.suspects.length > 0 && (
                <div className="font-mono-data text-xs text-error">
                  👤 Linked Suspects: {c.suspects.join(", ")}
                </div>
              )}

              <div className="flex gap-2 pt-2 mt-auto">
                <button
                  onClick={() =>
                    generateCasePdf({
                      ...c,
                      officerName,
                      badgeNumber,
                      tier,
                    })
                  }
                  className="flex-1 py-1.5 border border-primary/40 text-primary hover:bg-primary/10 font-label-md text-xs rounded flex items-center justify-center gap-1 cursor-pointer"
                >
                  <span className="material-symbols-outlined text-xs">picture_as_pdf</span> EXPORT PDF
                </button>

                <button
                  onClick={() =>
                    onQueryCaseInOrchestrator(`Show pattern search for ${c.case_id}`)
                  }
                  className="flex-1 py-1.5 bg-primary text-on-primary hover:bg-primary/90 font-label-md text-xs rounded flex items-center justify-center gap-1 cursor-pointer"
                >
                  <span className="material-symbols-outlined text-xs">hub</span> GRAPH QUERY
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
