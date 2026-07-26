"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase-browser";
import { useAuth, DEFAULT_DEMO_OFFICER, type OfficerProfile } from "@/lib/auth-context";
import { authenticateOrCreateOfficer, saveOfficerAccount } from "@/lib/officer-store";

export const dynamic = "force-dynamic";

export default function LoginPage() {
  const router = useRouter();
  const supabase = createClient();
  const { setDemoSession } = useAuth();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [role, setRole] = useState<"field" | "investigator" | "admin">("investigator");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleDemoSignIn() {
    await setDemoSession(DEFAULT_DEMO_OFFICER);
    window.location.href = "/";
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);

    const trimmedInput = email.trim();
    if (!trimmedInput || !password) {
      setError("Please enter your Service ID / Email and Secure Access Key.");
      setLoading(false);
      return;
    }

    const isEmail = trimmedInput.includes("@");
    const formattedEmail = isEmail
      ? trimmedInput.toLowerCase()
      : `${trimmedInput.toLowerCase().replace(/[^a-z0-9]/g, "")}@ksp.gov.in`;

    try {
      // 1) Try Supabase auth if configured
      const { data, error: signInError } = await supabase.auth.signInWithPassword({
        email: formattedEmail,
        password,
      });

      if (!signInError && data?.user) {
        const { data: profile } = await supabase
          .from("officer_profiles")
          .select("id, email, full_name, badge_number, tier, department, mobile_number")
          .eq("id", data.user.id)
          .maybeSingle();

        const prof: OfficerProfile = profile
          ? (profile as OfficerProfile)
          : {
              id: data.user.id,
              email: data.user.email || formattedEmail,
              full_name: data.user.user_metadata?.full_name || "Karnataka Police Officer",
              badge_number: data.user.user_metadata?.badge_number || `KSP-${data.user.id.slice(0, 5).toUpperCase()}`,
              tier: (data.user.user_metadata?.tier || "inspector") as any,
              department: data.user.user_metadata?.department || "Karnataka State Police Department",
              mobile_number: data.user.user_metadata?.mobile_number || "9876543210",
            };

        saveOfficerAccount({ profile: prof, password });
        await setDemoSession(prof);
        window.location.href = "/";
        return;
      }

      // 2) Fallback to persistent local officer store (supports email or Service ID)
      const result = authenticateOrCreateOfficer(trimmedInput, password);

      if (!result.success) {
        setError(result.error || "Incorrect password for this Service ID / Email.");
        setLoading(false);
        return;
      }

      if (result.profile) {
        await setDemoSession(result.profile);
        window.location.href = "/";
        return;
      }
    } catch {
      const result = authenticateOrCreateOfficer(trimmedInput, password);
      if (result.profile) {
        await setDemoSession(result.profile);
        window.location.href = "/";
        return;
      }
      setError("Authorization failed. Please check credentials.");
      setLoading(false);
    }
  }

  return (
    <div className="bg-surface text-on-surface min-h-screen flex flex-col font-body-md relative overflow-hidden">
      {/* Background Layer */}
      <div className="fixed inset-0 tactical-grid pointer-events-none z-0"></div>
      <div className="fixed inset-0 bg-gradient-to-b from-surface-container-lowest/50 via-surface/80 to-surface-dim pointer-events-none z-0"></div>

      {/* Top App Bar */}
      <header className="flex items-center justify-between px-margin w-full h-16 border-b border-outline-variant bg-surface-container z-50">
        <div className="flex items-center gap-sm">
          <span className="material-symbols-outlined text-primary">policy</span>
          <span className="font-label-md text-label-md tracking-widest text-primary">K.P. INTELLIGENCE PORTAL</span>
        </div>
        <div className="flex items-center gap-xs">
          <div className="w-2 h-2 rounded-full bg-secondary-fixed biometric-pulse"></div>
          <span className="font-label-md text-label-md text-secondary-fixed">ENCRYPTED TERMINAL</span>
        </div>
      </header>

      {/* Main Content */}
      <main className="flex-grow flex items-center justify-center p-margin relative z-10 my-auto">
        <div className="w-full max-w-xl">
          <div className="glass-panel p-lg shadow-2xl relative overflow-hidden rounded-xl">
            {/* Decorative Scan Line */}
            <div className="absolute inset-0 pointer-events-none">
              <div className="security-scan-line"></div>
            </div>

            {/* Branding & Logo */}
            <div className="flex flex-col items-center mb-xl">
              <div className="w-24 h-24 mb-md relative">
                <img
                  className="w-full h-full object-contain filter drop-shadow-[0_0_15px_rgba(179,197,255,0.3)]"
                  alt="State Emblem of Karnataka"
                  src="https://lh3.googleusercontent.com/aida-public/AB6AXuCPiZg5ez2r1VPGNoYa1i9zfRzCRYKwjHfNBQv_FlcD3R293qI4biq6xGcSj5U2SSuF2LjMz8e4gOtVYMbRoRUc35QOu5TGZA7X8mjHk44-EJvaBqx0DExOYruLAcKnU-v2wmIVlw2StawqPsSz0n7SYyYncDVM5Yj8J0JYssLAS0q3h171AXAqguJVTQI6Oj7uLezl3V0vESSYeZNrgHr1e_Lzzf1Apquhxk6RgxDy5kBXyK9XA1q_jiSisFRGk5-2sZ-B1CPVd3TJ"
                />
              </div>
              <h1 className="font-headline-md text-headline-md font-bold text-primary tracking-tight">KRIME AI</h1>
              <p className="font-label-md text-label-md text-outline uppercase tracking-[0.2em] mt-xs text-center">
                Criminal Records Intelligence & Management Engine
              </p>
            </div>

            {/* Error Alert */}
            {error && (
              <div className="mb-md p-sm bg-error-container/30 border border-error/50 text-error rounded flex items-center gap-sm">
                <span className="material-symbols-outlined text-error">warning</span>
                <span className="text-body-sm font-body-sm">{error}</span>
              </div>
            )}

            {/* Login Form */}
            <form className="space-y-lg relative" onSubmit={handleSubmit}>
              {/* Role Selection */}
              <div className="grid grid-cols-3 gap-base">
                <label className="relative cursor-pointer group">
                  <input
                    type="radio"
                    name="role"
                    value="field"
                    checked={role === "field"}
                    onChange={() => setRole("field")}
                    className="peer sr-only"
                    suppressHydrationWarning
                  />
                  <div className="p-sm text-center border border-outline-variant bg-surface-container-low peer-checked:bg-primary-container peer-checked:border-primary transition-all duration-200 group-hover:bg-surface-container-high rounded">
                    <span className="material-symbols-outlined block mb-xs text-on-surface-variant peer-checked:text-primary">shield</span>
                    <span className="font-label-md text-label-md uppercase tracking-wider block">Field</span>
                  </div>
                </label>
                <label className="relative cursor-pointer group">
                  <input
                    type="radio"
                    name="role"
                    value="investigator"
                    checked={role === "investigator"}
                    onChange={() => setRole("investigator")}
                    className="peer sr-only"
                    suppressHydrationWarning
                  />
                  <div className="p-sm text-center border border-outline-variant bg-surface-container-low peer-checked:bg-primary-container peer-checked:border-primary transition-all duration-200 group-hover:bg-surface-container-high rounded">
                    <span className="material-symbols-outlined block mb-xs text-on-surface-variant peer-checked:text-primary">search_insights</span>
                    <span className="font-label-md text-label-md uppercase tracking-wider block">Investigator</span>
                  </div>
                </label>
                <label className="relative cursor-pointer group">
                  <input
                    type="radio"
                    name="role"
                    value="admin"
                    checked={role === "admin"}
                    onChange={() => setRole("admin")}
                    className="peer sr-only"
                    suppressHydrationWarning
                  />
                  <div className="p-sm text-center border border-outline-variant bg-surface-container-low peer-checked:bg-primary-container peer-checked:border-primary transition-all duration-200 group-hover:bg-surface-container-high rounded">
                    <span className="material-symbols-outlined block mb-xs text-on-surface-variant peer-checked:text-primary">admin_panel_settings</span>
                    <span className="font-label-md text-label-md uppercase tracking-wider block">Admin</span>
                  </div>
                </label>
              </div>

              <div className="space-y-md">
                {/* Service ID / Email Input */}
                <div className="relative group">
                  <div className="absolute left-0 top-1/2 -translate-y-1/2 flex items-center justify-center w-10 text-outline group-focus-within:text-primary">
                    <span className="material-symbols-outlined">badge</span>
                  </div>
                  <input
                    type="text"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="SERVICE ID / KSP-NUMBER OR EMAIL"
                    className="w-full bg-surface-container-highest/30 border-b border-outline-variant py-md pl-12 pr-md font-mono-data text-on-surface placeholder:text-outline/50 transition-all focus:bg-surface-container-highest/50 focus:outline-none"
                    required
                    suppressHydrationWarning
                  />
                </div>

                {/* Password Input */}
                <div className="relative group">
                  <div className="absolute left-0 top-1/2 -translate-y-1/2 flex items-center justify-center w-10 text-outline group-focus-within:text-primary">
                    <span className="material-symbols-outlined">lock</span>
                  </div>
                  <input
                    type="password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="SECURE ACCESS KEY"
                    className="w-full bg-surface-container-highest/30 border-b border-outline-variant py-md pl-12 pr-md font-mono-data text-on-surface placeholder:text-outline/50 transition-all focus:bg-surface-container-highest/50 focus:outline-none"
                    required
                    suppressHydrationWarning
                  />
                </div>
              </div>

              {/* Actions Area */}
              <div className="flex flex-col gap-md">
                <button
                  type="submit"
                  disabled={loading}
                  suppressHydrationWarning
                  className="w-full bg-primary text-on-primary py-md font-bold uppercase tracking-[0.2em] transition-all hover:bg-primary/90 gold-accent-hover flex items-center justify-center gap-sm group rounded cursor-pointer disabled:opacity-50"
                >
                  {loading ? (
                    <>
                      <span className="animate-spin material-symbols-outlined">progress_activity</span>
                      <span>AUTHENTICATING...</span>
                    </>
                  ) : (
                    <>
                      <span>AUTHORIZE ACCESS</span>
                      <span className="material-symbols-outlined group-hover:translate-x-1 transition-transform">arrow_forward</span>
                    </>
                  )}
                </button>

                <div className="flex items-center justify-between text-label-md font-label-md text-outline">
                  <button
                    type="button"
                    onClick={handleDemoSignIn}
                    className="hover:text-primary transition-colors flex items-center gap-xs cursor-pointer"
                  >
                    <span className="material-symbols-outlined text-[16px]">fingerprint</span>
                    DEMO QUICK SIGN-IN
                  </button>
                  <Link href="/forgot-password" className="hover:text-primary transition-colors">
                    FORGOT CREDENTIALS?
                  </Link>
                </div>

                <div className="text-center pt-xs text-body-sm text-outline">
                  Don&apos;t have an account?{" "}
                  <Link href="/signup" className="text-primary hover:underline font-semibold">
                    Register Officer Profile
                  </Link>
                </div>
              </div>
            </form>

            {/* Footer Warning inside Card */}
            <div className="mt-lg pt-md border-t border-outline-variant flex gap-sm items-start opacity-70">
              <span className="material-symbols-outlined text-on-tertiary-container text-sm">warning</span>
              <p className="text-[10px] leading-tight text-on-surface-variant uppercase tracking-wider">
                Authorized personnel only. All access and query activity is logged and monitored under Section 66 of the IT Act. Unauthorized access attempts will be prosecuted to the fullest extent of the law.
              </p>
            </div>
          </div>

          {/* Contextual Helper Info */}
          <div className="mt-md flex justify-between items-center px-sm">
            <div className="flex items-center gap-xs text-outline font-mono-data text-[10px]">
              <span className="w-2 h-2 rounded-full bg-green-500 shadow-[0_0_8px_rgba(34,197,94,0.6)]"></span>
              SECURE CONNECTION VERIFIED: 256-BIT AES
            </div>
            <div className="text-outline font-mono-data text-[10px] uppercase">
              Node: BENGALURU-SEC-04
            </div>
          </div>
        </div>
      </main>

      {/* Footer */}
      <footer className="w-full py-sm px-margin flex flex-col md:flex-row justify-between items-center bg-surface-dim border-t border-outline-variant z-50">
        <div className="font-label-md text-label-md text-outline">
          © 2024 KARNATAKA POLICE DEPT | SECURE ANALYTICS UNIT
        </div>
        <div className="flex gap-lg mt-sm md:mt-0">
          <a className="font-label-md text-label-md text-outline hover:text-on-surface transition-colors" href="#">Standard Operating Procedures</a>
          <a className="font-label-md text-label-md text-outline hover:text-on-surface transition-colors" href="#">Privacy Policy</a>
          <a className="font-label-md text-label-md text-outline hover:text-on-surface transition-colors" href="#">Contact Support</a>
        </div>
      </footer>
    </div>
  );
}
