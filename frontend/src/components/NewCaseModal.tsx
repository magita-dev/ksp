"use client";

import React, { useState } from "react";

interface NewCaseModalProps {
  isOpen: boolean;
  onClose: () => void;
  onCaseAdded: () => void;
}

export function NewCaseModal({ isOpen, onClose, onCaseAdded }: NewCaseModalProps) {
  const [title, setTitle] = useState("");
  const [crimeType, setCrimeType] = useState("burglary");
  const [district, setDistrict] = useState("Bengaluru Urban");
  const [area, setArea] = useState("");
  const [narrative, setNarrative] = useState("");

  const [entryMethod, setEntryMethod] = useState("forced_door");
  const [timeOfDay, setTimeOfDay] = useState("night");
  const [weaponType, setWeaponType] = useState("knife");
  const [targetType, setTargetType] = useState("residential");
  const [suspectName, setSuspectName] = useState("");

  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!isOpen) return null;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    if (!title.trim() || !narrative.trim()) {
      setError("Please fill in Case Title and Incident Narrative.");
      return;
    }

    try {
      setSubmitting(true);
      const res = await fetch("/api/cases", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: title.trim(),
          crime_type: crimeType,
          district,
          area: area.trim() || "Main Precinct Area",
          narrative: narrative.trim(),
          entry_method: entryMethod,
          time_of_day: timeOfDay,
          weapon_type: weaponType,
          target_type: targetType,
          suspect_name: suspectName.trim() || undefined,
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || "Failed to submit new case.");
      }

      // Also persist to localStorage so custom FIRs are retained on client
      if (data.case) {
        try {
          const existing = JSON.parse(localStorage.getItem("ksp_custom_firs") || "[]");
          const updated = [data.case, ...existing.filter((item: { case_id: string }) => item.case_id !== data.case.case_id)];
          localStorage.setItem("ksp_custom_firs", JSON.stringify(updated));
        } catch (e) {
          console.error("Failed saving FIR to localStorage:", e);
        }
      }

      setTitle("");
      setArea("");
      setNarrative("");
      setSuspectName("");
      onCaseAdded();
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error submitting case.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 bg-surface/80 backdrop-blur-md flex items-center justify-center p-margin">
      <div className="glass-panel w-full max-w-2xl p-lg rounded-xl border border-outline-variant/40 shadow-2xl relative max-h-[90vh] overflow-y-auto custom-scrollbar">
        <div className="flex justify-between items-center border-b border-outline-variant/30 pb-md mb-md">
          <div className="flex items-center gap-sm">
            <span className="material-symbols-outlined text-primary">add_box</span>
            <h2 className="font-headline-md text-headline-md font-bold text-primary uppercase tracking-tight">
              LOG NEW FIR / INCIDENT RECORD
            </h2>
          </div>
          <button
            onClick={onClose}
            className="text-on-surface-variant hover:text-on-surface p-1 rounded transition-colors"
          >
            ✕
          </button>
        </div>

        {error && (
          <div className="mb-md p-sm bg-error-container/40 border border-error/50 text-error rounded flex items-center gap-sm">
            <span className="material-symbols-outlined text-error">warning</span>
            <span className="text-body-sm">{error}</span>
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-md">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-md">
            <div className="space-y-xs">
              <label className="font-label-md text-label-md text-secondary-fixed uppercase">
                Case Title *
              </label>
              <input
                type="text"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="e.g. Koramangala Gold Shop Heist"
                className="w-full bg-surface-container-highest/30 border-b border-outline-variant py-sm px-base font-body-md text-on-surface focus:border-primary focus:outline-none"
                required
              />
            </div>

            <div className="space-y-xs">
              <label className="font-label-md text-label-md text-secondary-fixed uppercase">
                Crime Category *
              </label>
              <select
                value={crimeType}
                onChange={(e) => setCrimeType(e.target.value)}
                className="w-full bg-surface-container-highest/60 border-b border-outline-variant py-sm px-base font-body-md text-on-surface focus:border-primary focus:outline-none"
              >
                <option value="burglary">Burglary</option>
                <option value="robbery">Robbery</option>
                <option value="fraud">Fraud / Cybercrime</option>
                <option value="theft">Vehicle Theft</option>
                <option value="cheating">Cheating / Scam</option>
              </select>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-md">
            <div className="space-y-xs">
              <label className="font-label-md text-label-md text-secondary-fixed uppercase">
                District *
              </label>
              <select
                value={district}
                onChange={(e) => setDistrict(e.target.value)}
                className="w-full bg-surface-container-highest/60 border-b border-outline-variant py-sm px-base font-body-md text-on-surface focus:border-primary focus:outline-none"
              >
                <option value="Bengaluru Urban">Bengaluru Urban</option>
                <option value="Mysuru">Mysuru</option>
                <option value="Dharwad">Dharwad (Hubli)</option>
                <option value="Belagavi">Belagavi</option>
                <option value="Kalaburagi">Kalaburagi</option>
                <option value="Mangaluru">Mangaluru</option>
                <option value="Tumkuru">Tumkuru</option>
                <option value="Davangere">Davangere</option>
              </select>
            </div>

            <div className="space-y-xs">
              <label className="font-label-md text-label-md text-secondary-fixed uppercase">
                Area / Station Jurisdiction
              </label>
              <input
                type="text"
                value={area}
                onChange={(e) => setArea(e.target.value)}
                placeholder="e.g. Koramangala 5th Block"
                className="w-full bg-surface-container-highest/30 border-b border-outline-variant py-sm px-base font-body-md text-on-surface focus:border-primary focus:outline-none"
              />
            </div>
          </div>

          <div className="font-label-md text-label-md text-primary font-bold uppercase tracking-wider pt-2">
            MODUS OPERANDI (MO) FEATURES
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-sm">
            <div className="space-y-xs">
              <label className="font-label-md text-[10px] text-outline uppercase">Entry Method</label>
              <select
                value={entryMethod}
                onChange={(e) => setEntryMethod(e.target.value)}
                className="w-full bg-surface-container-highest/60 border-b border-outline-variant py-1 px-2 font-mono-data text-xs text-on-surface"
              >
                <option value="forced_door">Forced Door</option>
                <option value="window">Window Break</option>
                <option value="social_engineering">Social Engineering</option>
                <option value="cyber_phishing">Cyber Phishing</option>
                <option value="pickpocket">Pickpocket</option>
              </select>
            </div>

            <div className="space-y-xs">
              <label className="font-label-md text-[10px] text-outline uppercase">Time of Day</label>
              <select
                value={timeOfDay}
                onChange={(e) => setTimeOfDay(e.target.value)}
                className="w-full bg-surface-container-highest/60 border-b border-outline-variant py-1 px-2 font-mono-data text-xs text-on-surface"
              >
                <option value="night">Night</option>
                <option value="afternoon">Afternoon</option>
                <option value="evening">Evening</option>
                <option value="morning">Morning</option>
              </select>
            </div>

            <div className="space-y-xs">
              <label className="font-label-md text-[10px] text-outline uppercase">Weapon</label>
              <select
                value={weaponType}
                onChange={(e) => setWeaponType(e.target.value)}
                className="w-full bg-surface-container-highest/60 border-b border-outline-variant py-1 px-2 font-mono-data text-xs text-on-surface"
              >
                <option value="knife">Knife</option>
                <option value="firearm">Firearm</option>
                <option value="none">None</option>
                <option value="blunt_object">Iron Rod</option>
              </select>
            </div>

            <div className="space-y-xs">
              <label className="font-label-md text-[10px] text-outline uppercase">Target Type</label>
              <select
                value={targetType}
                onChange={(e) => setTargetType(e.target.value)}
                className="w-full bg-surface-container-highest/60 border-b border-outline-variant py-1 px-2 font-mono-data text-xs text-on-surface"
              >
                <option value="residential">Residential</option>
                <option value="commercial">Commercial</option>
                <option value="bank">Bank / ATM</option>
                <option value="vehicle">Vehicle</option>
              </select>
            </div>
          </div>

          <div className="space-y-xs">
            <label className="font-label-md text-label-md text-secondary-fixed uppercase">
              Suspect Name (Optional)
            </label>
            <input
              type="text"
              value={suspectName}
              onChange={(e) => setSuspectName(e.target.value)}
              placeholder="e.g. Ramesh 'Ranga' Gowda"
              className="w-full bg-surface-container-highest/30 border-b border-outline-variant py-sm px-base font-body-md text-on-surface focus:border-primary focus:outline-none"
            />
          </div>

          <div className="space-y-xs">
            <label className="font-label-md text-label-md text-secondary-fixed uppercase">
              Incident Narrative & FIR Details *
            </label>
            <textarea
              value={narrative}
              onChange={(e) => setNarrative(e.target.value)}
              placeholder="Detailed description of the incident, stolen items, witness statements..."
              className="w-full bg-surface-container-highest/30 border-b border-outline-variant p-sm font-body-md text-on-surface focus:border-primary focus:outline-none"
              rows={4}
              required
            />
          </div>

          <div className="flex justify-end gap-md pt-sm border-t border-outline-variant/30">
            <button
              type="button"
              onClick={onClose}
              className="px-md py-sm bg-surface-container-high text-on-surface-variant font-label-md text-body-md rounded hover:bg-surface-container-highest cursor-pointer"
            >
              Cancel
            </button>

            <button
              type="submit"
              disabled={submitting}
              className="px-lg py-sm bg-primary text-on-primary font-bold font-label-md text-body-md uppercase tracking-wider rounded hover:bg-primary/90 cursor-pointer disabled:opacity-50 flex items-center gap-2"
            >
              {submitting ? (
                <>
                  <span className="material-symbols-outlined animate-spin text-sm">progress_activity</span>
                  <span>LOGGING...</span>
                </>
              ) : (
                <>
                  <span className="material-symbols-outlined text-sm">check</span>
                  <span>REGISTER CASE</span>
                </>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
