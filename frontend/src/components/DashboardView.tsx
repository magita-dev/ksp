"use client";

import React, { useState, useEffect, useMemo } from "react";
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  PieChart,
  Pie,
  Cell,
  AreaChart,
  Area,
} from "recharts";

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

interface DashboardViewProps {
  onQueryCaseInOrchestrator?: (query: string) => void;
  refreshTrigger?: number;
}

const COLORS = ["#b3c5ff", "#ffe16d", "#ffb4ab", "#758dd5", "#e9c400", "#ff524c", "#435b9f"];

export function DashboardView({ onQueryCaseInOrchestrator, refreshTrigger }: DashboardViewProps) {
  const [cases, setCases] = useState<CaseItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [districtFilter, setDistrictFilter] = useState("all");

  useEffect(() => {
    async function loadCases() {
      try {
        setLoading(true);
        const res = await fetch("/api/cases");
        const data = await res.json();
        let apiCases: CaseItem[] = data.cases || [];

        try {
          const localCustom: CaseItem[] = JSON.parse(localStorage.getItem("ksp_custom_firs") || "[]");
          const existingIds = new Set(apiCases.map((c) => c.case_id));
          const newFromLocal = localCustom.filter((c) => !existingIds.has(c.case_id));
          apiCases = [...newFromLocal, ...apiCases];
        } catch (e) {
          console.error("Failed to read custom FIRs for dashboard:", e);
        }

        setCases(apiCases);
      } catch (e) {
        console.error("Failed to load cases for dashboard:", e);
      } finally {
        setLoading(false);
      }
    }
    loadCases();
  }, [refreshTrigger]);

  const filteredCases = useMemo(() => {
    if (districtFilter === "all") return cases;
    return cases.filter(
      (c) => c.location?.district.toLowerCase() === districtFilter.toLowerCase()
    );
  }, [cases, districtFilter]);

  const districts = useMemo(() => {
    return Array.from(new Set(cases.map((c) => c.location?.district).filter(Boolean)));
  }, [cases]);

  // 1. Crime Type Breakdown
  const crimeTypeData = useMemo(() => {
    const counts: Record<string, number> = {};
    filteredCases.forEach((c) => {
      const type = c.crime_type ? c.crime_type.toUpperCase() : "OTHER";
      counts[type] = (counts[type] || 0) + 1;
    });
    return Object.keys(counts).map((key) => ({
      name: key,
      value: counts[key],
    }));
  }, [filteredCases]);

  // 2. Cases by Area / District
  const areaData = useMemo(() => {
    const counts: Record<string, number> = {};
    filteredCases.forEach((c) => {
      const area = c.location?.village_or_area || c.location?.district || "Unknown";
      counts[area] = (counts[area] || 0) + 1;
    });
    return Object.keys(counts)
      .map((key) => ({
        area: key,
        count: counts[key],
      }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 8);
  }, [filteredCases]);

  // 3. Time of Day Distribution
  const timeOfDayData = useMemo(() => {
    const counts: Record<string, number> = {
      NIGHT: 0,
      MORNING: 0,
      AFTERNOON: 0,
      EVENING: 0,
    };

    filteredCases.forEach((c) => {
      const time = c.mo_features?.time_of_day?.toUpperCase() || "NIGHT";
      counts[time] = (counts[time] || 0) + 1;
    });

    return [
      { time: "Night (12am-5am)", cases: counts["NIGHT"] || 0 },
      { time: "Morning (5am-12pm)", cases: counts["MORNING"] || 0 },
      { time: "Afternoon (12pm-5pm)", cases: counts["AFTERNOON"] || 0 },
      { time: "Evening (5pm-12am)", cases: counts["EVENING"] || 0 },
    ];
  }, [filteredCases]);

  // 4. Target Type Distribution
  const targetTypeData = useMemo(() => {
    const counts: Record<string, number> = {};
    filteredCases.forEach((c) => {
      const target = c.mo_features?.target_type || "residential";
      const formatted = target.toUpperCase();
      counts[formatted] = (counts[formatted] || 0) + 1;
    });
    return Object.keys(counts).map((key) => ({
      name: key,
      value: counts[key],
    }));
  }, [filteredCases]);

  // Summary Metrics
  const totalCasesCount = filteredCases.length;
  const openCasesCount = filteredCases.filter((c) => c.status === "open").length;
  const closedCasesCount = filteredCases.filter((c) => c.status === "closed").length;
  const resolutionRate = totalCasesCount > 0 ? Math.round((closedCasesCount / totalCasesCount) * 100) : 0;
  const topCrimeType = crimeTypeData.length > 0 ? crimeTypeData.reduce((prev, current) => (prev.value > current.value ? prev : current)).name : "N/A";

  return (
    <div className="space-y-gutter">
      {/* Top Filter & Header Bar */}
      <div className="glass-card p-gutter rounded-xl flex flex-col md:flex-row justify-between items-start md:items-center gap-md">
        <div>
          <div className="flex items-center gap-2">
            <span className="material-symbols-outlined text-primary">analytics</span>
            <h2 className="font-headline-md text-headline-md font-bold text-primary tracking-tight">
              CRIME ANALYTICS & TREND INTELLIGENCE
            </h2>
          </div>
          <p className="font-body-sm text-body-sm text-on-surface-variant mt-1">
            Statistical visualization of crimes, Modus Operandi (MO), and regional hotspots across Karnataka
          </p>
        </div>

        <div className="flex items-center gap-2 bg-surface-container-high/60 p-2 rounded-lg border border-outline-variant/30">
          <label className="font-label-md text-label-md text-secondary-fixed">DISTRICT FILTER:</label>
          <select
            value={districtFilter}
            onChange={(e) => setDistrictFilter(e.target.value)}
            className="bg-surface-container text-on-surface font-mono-data text-body-sm p-1.5 rounded border border-outline-variant focus:outline-none"
          >
            <option value="all">ALL KARNATAKA DISTRICTS</option>
            {districts.map((d) => (
              <option key={d} value={d}>
                {d.toUpperCase()}
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-gutter">
        <div className="glass-card p-gutter rounded-xl border-l-4 border-primary">
          <span className="font-label-md text-label-md text-on-surface-variant uppercase">TOTAL INCIDENTS</span>
          <div className="flex items-baseline gap-2 mt-1">
            <span className="font-headline-lg text-headline-lg font-bold text-primary">{totalCasesCount}</span>
            <span className="font-mono-data text-mono-data text-primary">+12%</span>
          </div>
        </div>

        <div className="glass-card p-gutter rounded-xl border-l-4 border-error">
          <span className="font-label-md text-label-md text-on-surface-variant uppercase">ACTIVE OPEN FIRs</span>
          <div className="flex items-baseline gap-2 mt-1">
            <span className="font-headline-lg text-headline-lg font-bold text-error">{openCasesCount}</span>
            <span className="font-mono-data text-mono-data text-error uppercase">PENDING</span>
          </div>
        </div>

        <div className="glass-card p-gutter rounded-xl border-l-4 border-secondary-fixed">
          <span className="font-label-md text-label-md text-on-surface-variant uppercase">DOMINANT CATEGORY</span>
          <div className="flex items-baseline gap-2 mt-1">
            <span className="font-headline-md text-headline-md font-bold text-secondary-fixed truncate">{topCrimeType}</span>
          </div>
        </div>

        <div className="glass-card p-gutter rounded-xl border-l-4 border-green-400">
          <span className="font-label-md text-label-md text-on-surface-variant uppercase">CASE CLEARANCE RATE</span>
          <div className="flex items-baseline gap-2 mt-1">
            <span className="font-headline-lg text-headline-lg font-bold text-green-400">{resolutionRate}%</span>
            <span className="font-mono-data text-mono-data text-green-400">RESOLVED</span>
          </div>
        </div>
      </div>

      {loading ? (
        <div className="glass-card p-xl text-center text-on-surface-variant rounded-xl flex items-center justify-center gap-2">
          <span className="material-symbols-outlined animate-spin text-primary">progress_activity</span>
          <span>LOADING RECHARTS CRIME VISUALIZATIONS...</span>
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-gutter">
          {/* Chart 1 */}
          <div className="glass-card p-gutter rounded-xl flex flex-col gap-md">
            <div className="flex justify-between items-center">
              <h3 className="font-label-md text-label-md text-primary font-bold uppercase flex items-center gap-2">
                <span className="material-symbols-outlined text-sm">bar_chart</span>
                Crime Distribution by Type
              </h3>
              {onQueryCaseInOrchestrator && (
                <button
                  onClick={() => onQueryCaseInOrchestrator("Breakdown of crime types in Bengaluru")}
                  className="bg-primary/10 border border-primary/30 text-primary hover:bg-primary/20 px-2.5 py-1 rounded text-xs font-label-md flex items-center gap-1"
                >
                  <span className="material-symbols-outlined text-xs">search</span> QUERY AI
                </button>
              )}
            </div>
            <div className="w-full h-64">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={crimeTypeData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#273647" />
                  <XAxis dataKey="name" tick={{ fontSize: 11, fill: "#c5c6d2" }} />
                  <YAxis tick={{ fontSize: 11, fill: "#c5c6d2" }} allowDecimals={false} />
                  <Tooltip
                    contentStyle={{ backgroundColor: "#122131", borderRadius: "8px", color: "#d4e4fa", borderColor: "#444650" }}
                  />
                  <Bar dataKey="value" fill="#b3c5ff" radius={[4, 4, 0, 0]} name="Cases Count" />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>

          {/* Chart 2 */}
          <div className="glass-card p-gutter rounded-xl flex flex-col gap-md">
            <div className="flex justify-between items-center">
              <h3 className="font-label-md text-label-md text-secondary-fixed font-bold uppercase flex items-center gap-2">
                <span className="material-symbols-outlined text-sm">location_on</span>
                Top Hotspot Areas
              </h3>
              {onQueryCaseInOrchestrator && (
                <button
                  onClick={() => onQueryCaseInOrchestrator("Which area has highest burglary rate?")}
                  className="bg-secondary-fixed/10 border border-secondary-fixed/30 text-secondary-fixed hover:bg-secondary-fixed/20 px-2.5 py-1 rounded text-xs font-label-md flex items-center gap-1"
                >
                  <span className="material-symbols-outlined text-xs">search</span> QUERY AI
                </button>
              )}
            </div>
            <div className="w-full h-64">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart layout="vertical" data={areaData} margin={{ top: 10, right: 20, left: 20, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#273647" />
                  <XAxis type="number" tick={{ fontSize: 11, fill: "#c5c6d2" }} allowDecimals={false} />
                  <YAxis dataKey="area" type="category" tick={{ fontSize: 11, fill: "#c5c6d2" }} width={100} />
                  <Tooltip
                    contentStyle={{ backgroundColor: "#122131", borderRadius: "8px", color: "#d4e4fa", borderColor: "#444650" }}
                  />
                  <Bar dataKey="count" fill="#ffe16d" radius={[0, 4, 4, 0]} name="Incidents" />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>

          {/* Chart 3 */}
          <div className="glass-card p-gutter rounded-xl flex flex-col gap-md">
            <div className="flex justify-between items-center">
              <h3 className="font-label-md text-label-md text-error font-bold uppercase flex items-center gap-2">
                <span className="material-symbols-outlined text-sm">schedule</span>
                Incident Time of Day Pattern
              </h3>
              {onQueryCaseInOrchestrator && (
                <button
                  onClick={() => onQueryCaseInOrchestrator("Show night time burglary cases")}
                  className="bg-error/10 border border-error/30 text-error hover:bg-error/20 px-2.5 py-1 rounded text-xs font-label-md flex items-center gap-1"
                >
                  <span className="material-symbols-outlined text-xs">search</span> QUERY AI
                </button>
              )}
            </div>
            <div className="w-full h-64">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={timeOfDayData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#273647" />
                  <XAxis dataKey="time" tick={{ fontSize: 10, fill: "#c5c6d2" }} />
                  <YAxis tick={{ fontSize: 11, fill: "#c5c6d2" }} allowDecimals={false} />
                  <Tooltip
                    contentStyle={{ backgroundColor: "#122131", borderRadius: "8px", color: "#d4e4fa", borderColor: "#444650" }}
                  />
                  <Area type="monotone" dataKey="cases" stroke="#ffb4ab" fill="#ffb4ab" fillOpacity={0.3} name="Incidents" />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </div>

          {/* Chart 4 */}
          <div className="glass-card p-gutter rounded-xl flex flex-col gap-md">
            <div className="flex justify-between items-center">
              <h3 className="font-label-md text-label-md text-primary font-bold uppercase flex items-center gap-2">
                <span className="material-symbols-outlined text-sm">pie_chart</span>
                Target Type Distribution
              </h3>
              {onQueryCaseInOrchestrator && (
                <button
                  onClick={() => onQueryCaseInOrchestrator("Show residential vs commercial thefts")}
                  className="bg-primary/10 border border-primary/30 text-primary hover:bg-primary/20 px-2.5 py-1 rounded text-xs font-label-md flex items-center gap-1"
                >
                  <span className="material-symbols-outlined text-xs">search</span> QUERY AI
                </button>
              )}
            </div>
            <div className="w-full h-64">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={targetTypeData}
                    cx="50%"
                    cy="50%"
                    innerRadius={50}
                    outerRadius={85}
                    paddingAngle={3}
                    dataKey="value"
                    label={({ name, percent }: { name?: string; percent?: number }) =>
                      `${name || ""} ${((percent || 0) * 100).toFixed(0)}%`
                    }
                    labelLine={false}
                  >
                    {targetTypeData.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                    ))}
                  </Pie>
                  <Tooltip
                    contentStyle={{ backgroundColor: "#122131", borderRadius: "8px", color: "#d4e4fa", borderColor: "#444650" }}
                  />
                  <Legend wrapperStyle={{ fontSize: 11, color: "#c5c6d2" }} />
                </PieChart>
              </ResponsiveContainer>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
