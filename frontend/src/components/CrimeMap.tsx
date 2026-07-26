"use client";

import React, { useState, useEffect } from "react";
import { generateCasePdf } from "@/lib/pdfExporter";

interface Location {
  district: string;
  taluk?: string;
  village_or_area: string;
  latitude: number;
  longitude: number;
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

interface CrimeMapProps {
  onQueryCase?: (query: string) => void;
  officerName?: string;
  badgeNumber?: string;
  tier?: string;
  refreshTrigger?: number;
}

const POLICE_STATIONS = [
  { name: "KSP State HQ (Bengaluru)", district: "Bengaluru Urban", lat: 12.9716, lng: 77.5946, code: "KSP-HQ" },
  { name: "Central Crime Branch (CCB)", district: "Bengaluru Urban", lat: 12.9622, lng: 77.5852, code: "CCB-BLR" },
  { name: "Yelahanka Police Station", district: "Bengaluru Urban", lat: 13.1007, lng: 77.5963, code: "PS-YLK" },
  { name: "Jayanagar Police Station", district: "Bengaluru Urban", lat: 12.9250, lng: 77.5938, code: "PS-JYN" },
  { name: "Mysuru City Police HQ", district: "Mysuru", lat: 12.3052, lng: 76.6552, code: "PS-MYS" },
  { name: "Hubli-Dharwad Crime Branch", district: "Dharwad", lat: 15.3647, lng: 75.1240, code: "PS-HBL" },
];

export function CrimeMap({ onQueryCase, officerName, badgeNumber, tier, refreshTrigger }: CrimeMapProps) {
  const [cases, setCases] = useState<CaseItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedDistrict, setSelectedDistrict] = useState("all");
  const [selectedCrime, setSelectedCrime] = useState("all");
  const [activeCase, setActiveCase] = useState<CaseItem | null>(null);
  const [isSheetOpen, setIsSheetOpen] = useState(false);

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
          console.error("Failed to read custom FIRs for map:", e);
        }

        setCases(apiCases);
      } catch (e) {
        console.error("Failed to load map case data:", e);
      } finally {
        setLoading(false);
      }
    }
    loadCases();
  }, [refreshTrigger]);

  const filteredCases = cases.filter((c) => {
    const matchDistrict =
      selectedDistrict === "all" ||
      c.location?.district.toLowerCase() === selectedDistrict.toLowerCase();
    const matchCrime =
      selectedCrime === "all" ||
      c.crime_type.toLowerCase() === selectedCrime.toLowerCase();
    return matchDistrict && matchCrime;
  });

  const districts = Array.from(
    new Set(cases.map((c) => c.location?.district).filter(Boolean))
  );

  const crimeTypes = Array.from(
    new Set(cases.map((c) => c.crime_type).filter(Boolean))
  );

  function getMapPosition(lat: number, lng: number) {
    const minLat = 11.5;
    const maxLat = 18.5;
    const minLng = 74.0;
    const maxLng = 78.5;

    const topPct = 100 - ((lat - minLat) / (maxLat - minLat)) * 100;
    const leftPct = ((lng - minLng) / (maxLng - minLng)) * 100;

    return {
      top: `${Math.max(10, Math.min(90, topPct))}%`,
      left: `${Math.max(8, Math.min(92, leftPct))}%`,
    };
  }

  function getCrimeBadgeColor(type: string) {
    switch (type.toLowerCase()) {
      case "burglary":
        return "#ffb4ab"; // Red/Error
      case "robbery":
        return "#ff524c";
      case "fraud":
      case "cheating":
        return "#b3c5ff"; // Primary
      case "theft":
        return "#ffe16d"; // Gold
      default:
        return "#c5c6d2";
    }
  }

  return (
    <div className="relative w-full h-[calc(100vh-140px)] min-h-[600px] rounded-xl overflow-hidden glass-panel border border-outline-variant/30 flex flex-col">
      {/* Background Map Visualizer */}
      <div
        className="absolute inset-0 z-0 bg-cover bg-center opacity-80 filter brightness-75 contrast-125"
        style={{
          backgroundImage:
            "url('https://lh3.googleusercontent.com/aida-public/AB6AXuDi6eb_wn5HfPWSLyezQloLEC8oSMDMde9AR3CG_v0tLvssrbLU6kQP7qRytHGYES9IrxAnGVuUgaE_alLAMdBQgxQyxsGDc1UdPjFEvbN9AFWlucfFCjyGMAGVlHlH-dwnCEkAC2J_KeaJAINk0vLjOiUPv0CNwlyAKC1I8w5fKGypp-DBD5oJGaViC5Pdv6GtKiJkkGvsHKW4_Wllpddt_Khh8YX-DgS6rrDT8Xy-I58Cf0mOabSeCNNJ2Fudf7896opb2PY6nPYt')",
        }}
      ></div>
      <div className="absolute inset-0 map-gradient-overlay pointer-events-none z-0"></div>

      {/* Floating Filters & Legend Bar */}
      <div className="absolute top-4 left-4 right-4 z-20 flex flex-col md:flex-row justify-between items-start md:items-center gap-2 pointer-events-none">
        <div className="glass-panel p-2.5 rounded-lg flex flex-wrap items-center gap-3 border-outline-variant/30 pointer-events-auto">
          <div className="flex items-center gap-1.5 text-primary">
            <span className="material-symbols-outlined text-sm">radar</span>
            <span className="font-label-md text-label-md font-bold uppercase tracking-wider">
              KARNATAKA LIVE GRID
            </span>
          </div>

          <div className="h-4 w-px bg-outline-variant/40 hidden sm:block"></div>

          <select
            value={selectedDistrict}
            onChange={(e) => setSelectedDistrict(e.target.value)}
            className="bg-surface-container text-on-surface font-mono-data text-xs p-1 rounded border border-outline-variant focus:outline-none"
          >
            <option value="all">ALL DISTRICTS</option>
            {districts.map((d) => (
              <option key={d} value={d}>
                {d.toUpperCase()}
              </option>
            ))}
          </select>

          <select
            value={selectedCrime}
            onChange={(e) => setSelectedCrime(e.target.value)}
            className="bg-surface-container text-on-surface font-mono-data text-xs p-1 rounded border border-outline-variant focus:outline-none"
          >
            <option value="all">ALL CRIME TYPES</option>
            {crimeTypes.map((ct) => (
              <option key={ct} value={ct}>
                {ct.toUpperCase()}
              </option>
            ))}
          </select>
        </div>

        {/* Legend Overlay */}
        <div className="glass-panel px-3 py-1.5 rounded-lg flex items-center gap-3 text-xs font-mono-data pointer-events-auto border-outline-variant/30">
          <span className="flex items-center gap-1 text-error">
            <span className="w-2 h-2 rounded-full bg-error"></span> Burglary
          </span>
          <span className="flex items-center gap-1 text-secondary-fixed">
            <span className="w-2 h-2 rounded-full bg-secondary-fixed"></span> Theft
          </span>
          <span className="flex items-center gap-1 text-primary">
            <span className="w-2 h-2 rounded-full bg-primary"></span> Cyber/Fraud
          </span>
          <span className="flex items-center gap-1 text-green-400">
            <span className="w-2 h-2 rounded-full bg-green-400"></span> Station
          </span>
        </div>
      </div>

      {/* Map Pins */}
      <div className="relative w-full h-full z-10 pointer-events-auto">
        {/* Police Station Pins */}
        {POLICE_STATIONS.map((ps, i) => {
          const pos = getMapPosition(ps.lat, ps.lng);
          return (
            <div
              key={`ps-${i}`}
              className="absolute z-10 transform -translate-x-1/2 -translate-y-1/2 cursor-pointer group"
              style={{ top: pos.top, left: pos.left }}
            >
              <div className="w-6 h-6 rounded-full bg-green-500/20 border border-green-400 flex items-center justify-center text-green-400 shadow-[0_0_10px_#4ade80]">
                <span className="material-symbols-outlined text-[14px]">local_police</span>
              </div>
              <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-1 hidden group-hover:block glass-panel px-2 py-1 rounded text-[10px] font-mono-data text-on-surface whitespace-nowrap z-30">
                {ps.name} ({ps.code})
              </div>
            </div>
          );
        })}

        {/* Case Incident Hotspots */}
        {filteredCases.map((c) => {
          const lat = c.location?.latitude || 12.9716;
          const lng = c.location?.longitude || 77.5946;
          const pos = getMapPosition(lat, lng);
          const color = getCrimeBadgeColor(c.crime_type);
          const isSelected = activeCase?.case_id === c.case_id;

          return (
            <div
              key={c.case_id}
              className="absolute z-20 transform -translate-x-1/2 -translate-y-1/2 cursor-pointer group"
              style={{ top: pos.top, left: pos.left }}
              onClick={() => setActiveCase(c)}
            >
              <div
                className="w-10 h-10 rounded-full hotspot-pulse flex items-center justify-center"
                style={{ backgroundColor: `${color}33` }}
              >
                <div
                  className={`w-3.5 h-3.5 rounded-full border-2 border-surface transition-transform duration-200 ${
                    isSelected ? "scale-150 ring-2 ring-secondary-fixed" : ""
                  }`}
                  style={{ backgroundColor: color }}
                ></div>
              </div>

              {/* Pin Tooltip */}
              <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 hidden group-hover:block glass-panel p-2 rounded-lg text-xs w-48 z-30 border-outline-variant/40">
                <p className="font-label-md font-bold text-primary">{c.case_id}</p>
                <p className="font-body-sm text-on-surface truncate">{c.title}</p>
                <p className="font-mono-data text-[10px] text-on-surface-variant mt-0.5">
                  {c.location?.village_or_area || c.location?.district}
                </p>
              </div>
            </div>
          );
        })}
      </div>

      {/* Selected Case Detail Floating Panel */}
      {activeCase && (
        <div className="absolute bottom-4 right-4 z-40 w-80 sm:w-96 glass-panel p-md rounded-xl border-l-4 border-primary shadow-2xl flex flex-col gap-sm">
          <div className="flex justify-between items-start">
            <div>
              <span className="font-mono-data text-xs bg-primary-container text-on-primary-container px-2 py-0.5 rounded mr-2">
                {activeCase.case_id}
              </span>
              <span
                className={`font-label-md text-xs px-2 py-0.5 rounded uppercase ${
                  activeCase.status === "open"
                    ? "bg-error-container text-on-error-container"
                    : "bg-surface-container-high text-on-surface-variant"
                }`}
              >
                {activeCase.status}
              </span>
            </div>
            <button
              onClick={() => setActiveCase(null)}
              className="text-on-surface-variant hover:text-on-surface"
            >
              ✕
            </button>
          </div>

          <h3 className="font-headline-md text-body-lg font-bold text-on-surface">{activeCase.title}</h3>

          <p className="font-mono-data text-xs text-secondary-fixed">
            📍 {activeCase.location?.village_or_area}, {activeCase.location?.district}
          </p>

          <div className="grid grid-cols-2 gap-1.5 p-2 bg-surface-container-low rounded border border-outline-variant/20 text-xs">
            <div>
              <span className="text-outline block">ENTRY:</span>
              <span className="font-mono-data text-on-surface font-semibold">
                {activeCase.mo_features?.entry_method || "N/A"}
              </span>
            </div>
            <div>
              <span className="text-outline block">TIME:</span>
              <span className="font-mono-data text-on-surface font-semibold">
                {activeCase.mo_features?.time_of_day || "N/A"}
              </span>
            </div>
            <div>
              <span className="text-outline block">WEAPON:</span>
              <span className="font-mono-data text-on-surface font-semibold">
                {activeCase.mo_features?.weapon_type || "None"}
              </span>
            </div>
            <div>
              <span className="text-outline block">TARGET:</span>
              <span className="font-mono-data text-on-surface font-semibold">
                {activeCase.mo_features?.target_type || "Residential"}
              </span>
            </div>
          </div>

          <p className="font-body-sm text-xs text-on-surface-variant line-clamp-3">
            {activeCase.narrative}
          </p>

          <div className="flex gap-2 pt-1">
            <button
              onClick={() =>
                generateCasePdf({
                  ...activeCase,
                  officerName,
                  badgeNumber,
                  tier,
                })
              }
              className="flex-1 py-1.5 bg-primary text-on-primary font-label-md text-xs rounded hover:bg-primary/90 flex items-center justify-center gap-1 cursor-pointer"
            >
              <span className="material-symbols-outlined text-xs">description</span> EXPORT PDF
            </button>

            {onQueryCase && (
              <button
                onClick={() => onQueryCase(`Cases similar to ${activeCase.case_id}`)}
                className="flex-1 py-1.5 border border-secondary-fixed text-secondary-fixed hover:bg-secondary-fixed/10 font-label-md text-xs rounded flex items-center justify-center gap-1 cursor-pointer"
              >
                <span className="material-symbols-outlined text-xs">hub</span> GRAPH QUERY
              </button>
            )}
          </div>
        </div>
      )}

      {/* Bottom Sheet for AI Predicted Hotspots */}
      <div
        className={`absolute bottom-0 left-1/2 -translate-x-1/2 w-full md:w-[70%] lg:w-[50%] glass-panel rounded-t-2xl z-30 p-md transition-transform duration-300 ${
          isSheetOpen ? "translate-y-0" : "translate-y-[calc(100%-48px)]"
        }`}
      >
        <div
          className="w-12 h-1.5 bg-outline-variant/40 rounded-full mx-auto mb-2 cursor-pointer hover:bg-outline-variant"
          onClick={() => setIsSheetOpen((prev) => !prev)}
        ></div>

        <div
          className="flex justify-between items-center mb-3 cursor-pointer"
          onClick={() => setIsSheetOpen((prev) => !prev)}
        >
          <div className="flex items-center gap-2">
            <div className="relative flex items-center justify-center">
              <div className="w-2 h-2 bg-secondary-fixed rounded-full"></div>
              <div className="absolute vigilance-ring w-4 h-4 rounded-full"></div>
            </div>
            <h3 className="font-label-md text-label-md font-bold text-secondary-fixed uppercase tracking-wider">
              AI PREDICTED HOTSPOTS & THREAT FORECAST
            </h3>
          </div>
          <span className="font-mono-data text-xs text-outline">
            {isSheetOpen ? "▼ COLLAPSE" : "▲ EXPAND"}
          </span>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-sm max-h-60 overflow-y-auto custom-scrollbar pr-1">
          <div className="bg-surface-container-low p-sm border-l-4 border-error rounded-r-lg">
            <div className="flex justify-between items-start">
              <span className="font-label-md text-xs text-error font-bold">PROBABLE: ASSAULT</span>
              <span className="font-mono-data text-[10px] bg-error-container text-on-error-container px-1.5 py-0.5 rounded">
                HIGH (89%)
              </span>
            </div>
            <p className="font-body-sm font-semibold text-xs text-on-surface mt-1">
              Koramangala 5th Block
            </p>
            <p className="text-[11px] text-on-surface-variant mt-0.5">
              Likelihood increases at 22:30 based on historical trends & crowd density.
            </p>
          </div>

          <div className="bg-surface-container-low p-sm border-l-4 border-secondary-fixed rounded-r-lg">
            <div className="flex justify-between items-start">
              <span className="font-label-md text-xs text-secondary-fixed font-bold">PROBABLE: THEFT</span>
              <span className="font-mono-data text-[10px] bg-surface-container-high text-on-surface-variant px-1.5 py-0.5 rounded">
                MID (74%)
              </span>
            </div>
            <p className="font-body-sm font-semibold text-xs text-on-surface mt-1">
              Whitefield Metro Area
            </p>
            <p className="text-[11px] text-on-surface-variant mt-0.5">
              Peak transit hours detected. Probability of petty theft rising near North Exit.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
