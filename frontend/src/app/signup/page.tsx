"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase-browser";
import { TIERS, type Tier } from "@/lib/tiers";
import { saveOfficerAccount } from "@/lib/officer-store";
import { useAuth, type OfficerProfile } from "@/lib/auth-context";

export const dynamic = "force-dynamic";

export default function SignupPage() {
  const router = useRouter();
  const supabase = createClient();
  const { setDemoSession } = useAuth();

  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [mobile, setMobile] = useState("");
  const [badge, setBadge] = useState("");
  const [department, setDepartment] = useState("");
  const [tier, setTier] = useState<Tier>("inspector");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [receipt, setReceipt] = useState<{
    refId: string;
    email: string;
  } | null>(null);

  function normalizeMobile(raw: string): string {
    return raw.replace(/\D/g, "");
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    const trimmedEmail = email.trim().toLowerCase();
    const cleanMobile = normalizeMobile(mobile);

    if (!fullName.trim()) return setError("Please enter your full name.");
    if (!trimmedEmail) return setError("Please enter your official email.");
    if (cleanMobile && !/^([6-9][0-9]{9})$/.test(cleanMobile))
      return setError(
        "Enter a valid 10-digit Indian mobile number (starts with 6-9), or leave it blank."
      );
    if (!badge.trim()) return setError("Please enter your badge number.");
    if (password.length < 8)
      return setError("Password must be at least 8 characters long.");
    if (password !== confirm) return setError("Passwords do not match.");

    setLoading(true);

    try {
      // 1) Try Supabase auth if configured
      const { data: authData, error: authError } = await supabase.auth.signUp({
        email: trimmedEmail,
        password,
      });

      const userId = authData?.user?.id || `officer-${Date.now()}`;

      // Save to local persistent store so officer login works
      const newOfficerProfile: OfficerProfile = {
        id: userId,
        email: trimmedEmail,
        full_name: fullName.trim(),
        badge_number: badge.trim(),
        tier: tier,
        department: department.trim() || "Karnataka State Police",
        mobile_number: cleanMobile || "9876543210",
      };

      saveOfficerAccount({
        profile: newOfficerProfile,
        password,
      });

      if (userId && authData?.user) {
        await supabase.from("officer_profiles").insert({
          id: userId,
          email: trimmedEmail,
          full_name: fullName.trim(),
          badge_number: badge.trim(),
          tier,
          department: department.trim() || null,
          mobile_number: cleanMobile || null,
          phone_e164: cleanMobile ? `+91${cleanMobile}` : null,
        });
      }

      const refId = `KSP-${userId.slice(0, 8).toUpperCase()}`;
      setReceipt({ refId, email: trimmedEmail });
    } catch {
      // Fallback local save
      const userId = `officer-${Date.now()}`;
      const newOfficerProfile: OfficerProfile = {
        id: userId,
        email: trimmedEmail,
        full_name: fullName.trim(),
        badge_number: badge.trim(),
        tier: tier,
        department: department.trim() || "Karnataka State Police",
        mobile_number: cleanMobile || "9876543210",
      };

      saveOfficerAccount({
        profile: newOfficerProfile,
        password,
      });

      setDemoSession(newOfficerProfile);

      // Trigger Nodemailer welcome dispatch
      fetch("/api/auth/send-welcome", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: trimmedEmail, profile: newOfficerProfile }),
      }).catch((e) => console.error("Welcome email dispatch failed:", e));

      const refId = `KSP-${userId.slice(0, 8).toUpperCase()}`;
      setReceipt({ refId, email: trimmedEmail });
    }

    setLoading(false);
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
          <span className="font-label-md text-label-md text-secondary-fixed">ENCRYPTED REGISTRATION</span>
        </div>
      </header>

      {/* Main Content */}
      <main className="flex-grow flex items-center justify-center p-margin relative z-10 my-auto py-12">
        <div className="w-full max-w-2xl">
          <div className="glass-panel p-lg shadow-2xl relative overflow-hidden rounded-xl border border-outline-variant/30">
            {/* Header branding */}
            <div className="flex flex-col items-center mb-lg">
              <div className="w-20 h-20 mb-sm relative">
                <img
                  className="w-full h-full object-contain filter drop-shadow-[0_0_15px_rgba(179,197,255,0.3)]"
                  alt="State Emblem of Karnataka"
                  src="https://lh3.googleusercontent.com/aida-public/AB6AXuCPiZg5ez2r1VPGNoYa1i9zfRzCRYKwjHfNBQv_FlcD3R293qI4biq6xGcSj5U2SSuF2LjMz8e4gOtVYMbRoRUc35QOu5TGZA7X8mjHk44-EJvaBqx0DExOYruLAcKnU-v2wmIVlw2StawqPsSz0n7SYyYncDVM5Yj8J0JYssLAS0q3h171AXAqguJVTQI6Oj7uLezl3V0vESSYeZNrgHr1e_Lzzf1Apquhxk6RgxDy5kBXyK9XA1q_jiSisFRGk5-2sZ-B1CPVd3TJ"
                />
              </div>
              <h1 className="font-headline-md text-headline-md font-bold text-primary tracking-tight">
                OFFICER REGISTRATION
              </h1>
              <p className="font-label-md text-label-md text-outline uppercase tracking-[0.2em] mt-xs text-center">
                Karnataka State Police Personnel Onboarding
              </p>
            </div>

            {error && (
              <div className="mb-md p-sm bg-error-container/30 border border-error/50 text-error rounded flex items-center gap-sm">
                <span className="material-symbols-outlined text-error">warning</span>
                <span className="text-body-sm font-body-sm">{error}</span>
              </div>
            )}

            {receipt ? (
              <div className="space-y-md text-center py-6">
                <div className="p-md bg-primary-container/30 border border-primary/50 text-primary rounded-lg flex flex-col items-center gap-sm">
                  <span className="material-symbols-outlined text-secondary-fixed text-4xl">verified</span>
                  <h2 className="font-headline-md text-headline-md font-bold text-on-surface">
                    Registration Completed
                  </h2>
                  <p className="font-mono-data text-secondary-fixed tracking-wider">
                    Reference ID: {receipt.refId}
                  </p>
                  <p className="font-body-sm text-on-surface-variant max-w-md mt-2">
                    Officer profile created for <strong>{receipt.email}</strong>. You can now access the intelligence portal.
                  </p>
                </div>

                <div className="pt-md flex flex-col gap-sm">
                  <button
                    onClick={() => { window.location.href = "/"; }}
                    className="w-full bg-primary text-on-primary py-md font-bold uppercase tracking-[0.2em] transition-all hover:bg-primary/90 rounded cursor-pointer"
                  >
                    ENTER INTELLIGENCE PORTAL NOW
                  </button>
                  <button
                    onClick={() => { window.location.href = "/login"; }}
                    className="w-full text-outline hover:text-on-surface py-sm font-label-md text-label-md uppercase tracking-wider cursor-pointer"
                  >
                    Go to Sign In Screen
                  </button>
                </div>
              </div>
            ) : (
              <form className="space-y-md" onSubmit={handleSubmit}>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-md">
                  {/* Full Name */}
                  <div className="space-y-xs">
                    <label className="font-label-md text-label-md text-secondary-fixed-dim uppercase flex items-center gap-xs">
                      <span className="material-symbols-outlined text-[14px]">person</span>
                      Full Name
                    </label>
                    <input
                      type="text"
                      value={fullName}
                      onChange={(e) => setFullName(e.target.value)}
                      placeholder="e.g. Inspector Ramesh Kumar"
                      className="w-full bg-surface-container-highest/30 border-b border-outline-variant py-sm px-base font-body-md text-on-surface focus:border-primary transition-all focus:outline-none"
                      required
                      suppressHydrationWarning
                    />
                  </div>

                  {/* Official Email */}
                  <div className="space-y-xs">
                    <label className="font-label-md text-label-md text-secondary-fixed-dim uppercase flex items-center gap-xs">
                      <span className="material-symbols-outlined text-[14px]">mail</span>
                      Official Email
                    </label>
                    <input
                      type="email"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      placeholder="officer@ksp.gov.in"
                      className="w-full bg-surface-container-highest/30 border-b border-outline-variant py-sm px-base font-body-md text-on-surface focus:border-primary transition-all focus:outline-none"
                      required
                      suppressHydrationWarning
                    />
                  </div>

                  {/* Badge Number */}
                  <div className="space-y-xs">
                    <label className="font-label-md text-label-md text-secondary-fixed-dim uppercase flex items-center gap-xs">
                      <span className="material-symbols-outlined text-[14px]">badge</span>
                      Badge Number / Service ID
                    </label>
                    <input
                      type="text"
                      value={badge}
                      onChange={(e) => setBadge(e.target.value)}
                      placeholder="KSP-INS-108"
                      className="w-full bg-surface-container-highest/30 border-b border-outline-variant py-sm px-base font-mono-data text-on-surface focus:border-primary transition-all focus:outline-none"
                      required
                      suppressHydrationWarning
                    />
                  </div>

                  {/* Mobile Number */}
                  <div className="space-y-xs">
                    <label className="font-label-md text-label-md text-secondary-fixed-dim uppercase flex items-center gap-xs">
                      <span className="material-symbols-outlined text-[14px]">phone</span>
                      Mobile Number (Optional)
                    </label>
                    <input
                      type="tel"
                      value={mobile}
                      onChange={(e) => setMobile(e.target.value)}
                      placeholder="9876543210"
                      className="w-full bg-surface-container-highest/30 border-b border-outline-variant py-sm px-base font-mono-data text-on-surface focus:border-primary transition-all focus:outline-none"
                      suppressHydrationWarning
                    />
                  </div>

                  {/* Department */}
                  <div className="space-y-xs">
                    <label className="font-label-md text-label-md text-secondary-fixed-dim uppercase flex items-center gap-xs">
                      <span className="material-symbols-outlined text-[14px]">corporate_fare</span>
                      Station / Department
                    </label>
                    <input
                      type="text"
                      value={department}
                      onChange={(e) => setDepartment(e.target.value)}
                      placeholder="e.g. Koramangala Station"
                      className="w-full bg-surface-container-highest/30 border-b border-outline-variant py-sm px-base font-body-md text-on-surface focus:border-primary transition-all focus:outline-none"
                      suppressHydrationWarning
                    />
                  </div>

                  {/* Tier Rank Selection */}
                  <div className="space-y-xs">
                    <label className="font-label-md text-label-md text-secondary-fixed-dim uppercase flex items-center gap-xs">
                      <span className="material-symbols-outlined text-[14px]">military_tech</span>
                      Officer Rank / Tier
                    </label>
                    <select
                      value={tier}
                      onChange={(e) => setTier(e.target.value as Tier)}
                      className="w-full bg-surface-container-highest/60 border-b border-outline-variant py-sm px-base font-body-md text-on-surface focus:border-primary transition-all focus:outline-none rounded-none"
                      suppressHydrationWarning
                    >
                      {TIERS.map((t) => (
                        <option key={t.id} value={t.id} className="bg-surface-container text-on-surface">
                          {t.label} ({t.short})
                        </option>
                      ))}
                    </select>
                  </div>

                  {/* Password */}
                  <div className="space-y-xs">
                    <label className="font-label-md text-label-md text-secondary-fixed-dim uppercase flex items-center gap-xs">
                      <span className="material-symbols-outlined text-[14px]">lock</span>
                      Password
                    </label>
                    <input
                      type="password"
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      placeholder="Min 8 characters"
                      className="w-full bg-surface-container-highest/30 border-b border-outline-variant py-sm px-base font-mono-data text-on-surface focus:border-primary transition-all focus:outline-none"
                      required
                      suppressHydrationWarning
                    />
                  </div>

                  {/* Confirm Password */}
                  <div className="space-y-xs">
                    <label className="font-label-md text-label-md text-secondary-fixed-dim uppercase flex items-center gap-xs">
                      <span className="material-symbols-outlined text-[14px]">lock_reset</span>
                      Confirm Password
                    </label>
                    <input
                      type="password"
                      value={confirm}
                      onChange={(e) => setConfirm(e.target.value)}
                      placeholder="Re-enter password"
                      className="w-full bg-surface-container-highest/30 border-b border-outline-variant py-sm px-base font-mono-data text-on-surface focus:border-primary transition-all focus:outline-none"
                      required
                      suppressHydrationWarning
                    />
                  </div>
                </div>

                <div className="pt-md">
                  <button
                    type="submit"
                    disabled={loading}
                    className="w-full bg-primary text-on-primary py-md font-bold uppercase tracking-[0.2em] transition-all hover:bg-primary/90 gold-accent-hover flex items-center justify-center gap-sm rounded cursor-pointer disabled:opacity-50"
                  >
                    {loading ? (
                      <>
                        <span className="animate-spin material-symbols-outlined">progress_activity</span>
                        <span>CREATING PROFILE...</span>
                      </>
                    ) : (
                      <>
                        <span>REGISTER OFFICER ACCOUNT</span>
                        <span className="material-symbols-outlined">arrow_forward</span>
                      </>
                    )}
                  </button>
                </div>

                <div className="text-center pt-xs text-body-sm text-outline">
                  Already registered?{" "}
                  <Link href="/login" className="text-primary hover:underline font-semibold">
                    Sign In to Portal
                  </Link>
                </div>
              </form>
            )}
          </div>
        </div>
      </main>

      {/* Footer */}
      <footer className="w-full py-sm px-margin flex flex-col md:flex-row justify-between items-center bg-surface-dim border-t border-outline-variant">
        <div className="font-label-md text-label-md text-outline">
          © 2024 KARNATAKA POLICE DEPT | SECURE ANALYTICS UNIT
        </div>
      </footer>
    </div>
  );
}
