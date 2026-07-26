import type { OfficerProfile } from "./auth-context";
import type { Tier } from "./tiers";

export interface StoredOfficerAccount {
  profile: OfficerProfile;
  password: string;
}

const LOCAL_OFFICERS_KEY = "ksp_registered_officers";

// Seed accounts so standard demo credentials work out-of-the-box
export const PRESEEDED_OFFICERS: StoredOfficerAccount[] = [
  {
    profile: {
      id: "demo-ig-officer",
      email: "ig.hq@ksp.gov.in",
      full_name: "Dr. Alok Mohan, IPS",
      badge_number: "KSP-IG-001",
      tier: "ig",
      department: "Karnataka State Police Headquarters (Full System Access)",
      mobile_number: "9876543210",
    },
    password: "Password@123",
  },
  {
    profile: {
      id: "demo-sp-officer",
      email: "sp.bengaluru@ksp.gov.in",
      full_name: "Shri B. Dayananda, IPS",
      badge_number: "KSP-SP-042",
      tier: "sp",
      department: "Bengaluru City Police Command",
      mobile_number: "9876543211",
    },
    password: "Password@123",
  },
  {
    profile: {
      id: "demo-inspector-officer",
      email: "inspector.koramangala@ksp.gov.in",
      full_name: "Inspector Rajesh Gowda",
      badge_number: "KSP-INS-108",
      tier: "inspector",
      department: "Koramangala Police Station",
      mobile_number: "9876543212",
    },
    password: "Password@123",
  },
];

export function getStoredOfficers(): StoredOfficerAccount[] {
  if (typeof window === "undefined") return PRESEEDED_OFFICERS;
  try {
    const raw = localStorage.getItem(LOCAL_OFFICERS_KEY);
    if (!raw) {
      localStorage.setItem(LOCAL_OFFICERS_KEY, JSON.stringify(PRESEEDED_OFFICERS));
      return PRESEEDED_OFFICERS;
    }
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed) && parsed.length > 0) {
      return parsed;
    }
  } catch {
    // fallback
  }
  return PRESEEDED_OFFICERS;
}

export function saveOfficerAccount(account: StoredOfficerAccount): void {
  if (typeof window === "undefined") return;
  const existing = getStoredOfficers();
  const idx = existing.findIndex(
    (a) => a.profile.email.toLowerCase() === account.profile.email.toLowerCase()
  );
  if (idx >= 0) {
    existing[idx] = account;
  } else {
    existing.push(account);
  }
  localStorage.setItem(LOCAL_OFFICERS_KEY, JSON.stringify(existing));
}

export function findOfficerAccount(identifier: string): StoredOfficerAccount | undefined {
  if (!identifier) return undefined;
  const clean = identifier.toLowerCase().trim();
  const normalizedBadge = clean.replace(/[^a-z0-9]/g, "");
  const officers = getStoredOfficers();

  return officers.find((o) => {
    const oEmail = o.profile.email.toLowerCase();
    const oBadge = o.profile.badge_number.toLowerCase();
    const oBadgeNormalized = oBadge.replace(/[^a-z0-9]/g, "");

    return (
      oEmail === clean ||
      oBadge === clean ||
      (normalizedBadge.length >= 3 && oBadgeNormalized === normalizedBadge)
    );
  });
}

export function authenticateOrCreateOfficer(
  input: string,
  pass: string
): { success: boolean; profile?: OfficerProfile; error?: string } {
  const cleanInput = input.trim();
  const isEmail = cleanInput.includes("@");
  const formattedEmail = isEmail
    ? cleanInput.toLowerCase()
    : `${cleanInput.toLowerCase().replace(/[^a-z0-9]/g, "")}@ksp.gov.in`;

  // First check if an existing officer matches by email, badge number, or Service ID
  const existing = findOfficerAccount(cleanInput) || findOfficerAccount(formattedEmail);

  if (existing) {
    // Verify password if set
    if (existing.password && existing.password !== pass) {
      return {
        success: false,
        error: "Incorrect password for this officer credentials. Preset demo password is Password@123.",
      };
    }
    return { success: true, profile: existing.profile };
  }

  // If new credentials, register officer account on-the-fly
  const namePart = (isEmail ? cleanInput.split("@")[0] : cleanInput).replace(/[._-]/g, " ");
  const formattedName = namePart
    .split(" ")
    .filter(Boolean)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");

  const randomDigits = Math.floor(10000 + Math.random() * 90000);
  const newProfile: OfficerProfile = {
    id: `officer-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    email: formattedEmail,
    full_name: formattedName ? `Officer ${formattedName}` : "Karnataka Police Officer",
    badge_number: isEmail ? `KSP-${randomDigits}` : cleanInput.toUpperCase(),
    tier: "inspector" as Tier,
    department: "Karnataka State Police Department",
    mobile_number: "9876543210",
  };

  saveOfficerAccount({
    profile: newProfile,
    password: pass,
  });

  return { success: true, profile: newProfile };
}
