export type Tier =
  | "constable"
  | "sub_inspector"
  | "inspector"
  | "dsp"
  | "sp"
  | "ig";

export interface TierInfo {
  id: Tier;
  label: string;
  short: string;
  rank: number;
  description: string;
  color: string;
}

// Ascending authority — rank 1 = entry, rank 6 = top
export const TIERS: TierInfo[] = [
  {
    id: "constable",
    label: "Police Constable",
    short: "PC",
    rank: 1,
    description: "Frontline officer handling first information reports and field duties.",
    color: "#475569",
  },
  {
    id: "sub_inspector",
    label: "Sub-Inspector",
    short: "SI",
    rank: 2,
    description: "Investigating officer responsible for case files and preliminary probes.",
    color: "#0369a1",
  },
  {
    id: "inspector",
    label: "Inspector",
    short: "PI",
    rank: 3,
    description: "Supervises investigations and signs off on charge sheets at station level.",
    color: "#1e3a5f",
  },
  {
    id: "dsp",
    label: "Deputy Superintendent",
    short: "DySP",
    rank: 4,
    description: "Reviews cross-station cases and coordinates multi-team operations.",
    color: "#7c2d12",
  },
  {
    id: "sp",
    label: "Superintendent of Police",
    short: "SP",
    rank: 5,
    description: "District-level command — clears high-level case linking and overrides.",
    color: "#4c1d95",
  },
  {
    id: "ig",
    label: "Inspector General",
    short: "IG",
    rank: 6,
    description: "State-level oversight across ranges. Full system access.",
    color: "#831843",
  },
];

export const TIER_MAP: Record<Tier, TierInfo> = Object.fromEntries(
  TIERS.map((t) => [t.id, t])
) as Record<Tier, TierInfo>;

export function tierLabel(id: string): string {
  return TIER_MAP[id as Tier]?.label ?? id;
}
