"use client";

import {
  createContext,
  useContext,
  useEffect,
  useState,
  ReactNode,
} from "react";
import type { Session, User } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase-browser";
import type { Tier } from "@/lib/tiers";

export interface OfficerProfile {
  id: string;
  email: string;
  full_name: string;
  badge_number: string;
  tier: Tier;
  department: string | null;
  mobile_number: string;
}

export const DEFAULT_DEMO_OFFICER: OfficerProfile = {
  id: "demo-ig-officer",
  email: "ig.hq@ksp.gov.in",
  full_name: "Dr. Alok Mohan, IPS",
  badge_number: "KSP-IG-001",
  tier: "ig",
  department: "Karnataka State Police Headquarters (Full System Access)",
  mobile_number: "9876543210",
};

interface AuthContextValue {
  session: Session | null;
  user: User | null;
  profile: OfficerProfile | null;
  loading: boolean;
  signOut: () => Promise<void>;
  refreshProfile: () => Promise<void>;
  setDemoSession: (prof?: OfficerProfile) => void;
}

const AuthContext = createContext<AuthContextValue>({
  session: null,
  user: null,
  profile: null,
  loading: true,
  signOut: async () => {},
  refreshProfile: async () => {},
  setDemoSession: () => {},
});

export function AuthProvider({ children }: { children: ReactNode }) {
  const [supabase] = useState(() => createClient());
  const [session, setSession] = useState<Session | null>(null);
  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<OfficerProfile | null>(null);
  const [loading, setLoading] = useState(true);

  async function setDemoSession(prof: OfficerProfile = DEFAULT_DEMO_OFFICER) {
    if (typeof window !== "undefined") {
      document.cookie = "ksp_demo_session=1; path=/; max-age=604800; SameSite=Lax";
      localStorage.setItem("ksp_demo_officer", JSON.stringify(prof));
      try {
        await fetch("/api/auth/session", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ profile: prof }),
        });
      } catch (e) {
        console.error("Session cookie route failed:", e);
      }
    }
    setProfile(prof);
    setUser({ id: prof.id, email: prof.email } as User);
  }

  async function loadProfile(uid: string) {
    try {
      const { data, error } = await supabase
        .from("officer_profiles")
        .select(
          "id, email, full_name, badge_number, tier, department, mobile_number"
        )
        .eq("id", uid)
        .maybeSingle();

      if (error || !data) {
        // Fallback to default demo profile if profile record missing or error
        setProfile(DEFAULT_DEMO_OFFICER);
        return;
      }
      setProfile(data as OfficerProfile);
    } catch {
      setProfile(DEFAULT_DEMO_OFFICER);
    }
  }

  useEffect(() => {
    let mounted = true;

    // First check local demo session
    if (typeof window !== "undefined") {
      const storedDemo = localStorage.getItem("ksp_demo_officer");
      if (storedDemo) {
        try {
          const parsed = JSON.parse(storedDemo);
          document.cookie = "ksp_demo_session=1; path=/; max-age=86400; SameSite=Lax";
          setProfile(parsed);
          setUser({ id: parsed.id, email: parsed.email } as User);
          setLoading(false);
          return;
        } catch {
          localStorage.removeItem("ksp_demo_officer");
        }
      }
    }

    supabase.auth.getSession().then(({ data }: { data: { session: Session | null } }) => {
      if (!mounted) return;
      setSession(data.session);
      setUser(data.session?.user ?? null);
      if (data.session?.user) {
        loadProfile(data.session.user.id).finally(() => {
          if (mounted) setLoading(false);
        });
      } else {
        // Default demo session fallback if not explicitly signed in
        if (typeof window !== "undefined" && !process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY) {
          setDemoSession();
        }
        setLoading(false);
      }
    }).catch(() => {
      if (mounted) {
        setDemoSession();
        setLoading(false);
      }
    });

    const { data: listener } = supabase.auth.onAuthStateChange(
      (_event: string, newSession: Session | null) => {
        (async () => {
          setSession(newSession);
          setUser(newSession?.user ?? null);
          if (newSession?.user) {
            await loadProfile(newSession.user.id);
          } else {
            if (typeof window !== "undefined" && !localStorage.getItem("ksp_demo_officer")) {
              setProfile(null);
            }
          }
          setLoading(false);
        })();
      }
    );

    return () => {
      mounted = false;
      listener.subscription.unsubscribe();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function signOut() {
    if (typeof window !== "undefined") {
      document.cookie = "ksp_demo_session=; path=/; max-age=0; SameSite=Lax";
      localStorage.removeItem("ksp_demo_officer");
      try {
        await fetch("/api/auth/session", { method: "DELETE" });
      } catch (e) {
        console.error("Session delete route failed:", e);
      }
    }
    await supabase.auth.signOut();
    setSession(null);
    setUser(null);
    setProfile(null);
    if (typeof window !== "undefined") {
      window.location.href = "/login";
    }
  }

  async function refreshProfile() {
    if (user) await loadProfile(user.id);
  }

  return (
    <AuthContext.Provider
      value={{ session, user, profile, loading, signOut, refreshProfile, setDemoSession }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  return useContext(AuthContext);
}

