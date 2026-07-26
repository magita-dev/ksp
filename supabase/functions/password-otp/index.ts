import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2.45.4";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

const CODE_TTL_MINUTES = 10;
const MAX_ATTEMPTS = 5;

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  try {
    const body = (await req.json()) as {
      action: "request" | "verify" | "reset";
      email?: string;
      code?: string;
      new_password?: string;
    };

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
      { auth: { persistSession: false } }
    );

    if (body.action === "request") {
      return await handleRequest(supabase, body.email ?? "");
    }
    if (body.action === "verify") {
      return await handleVerify(supabase, body.email ?? "", body.code ?? "");
    }
    if (body.action === "reset") {
      return await handleReset(
        supabase,
        body.email ?? "",
        body.code ?? "",
        body.new_password ?? ""
      );
    }

    return json({ error: "Unknown action." }, 400);
  } catch (err) {
    return json({ error: (err as Error).message }, 500);
  }
});

async function handleRequest(supabase: ReturnType<typeof createClient>, email: string) {
  if (!email) {
    return json({ error: "Email is required." }, 400);
  }

  const { data: officer, error } = await supabase
    .from("officer_profiles")
    .select("id, email, full_name")
    .eq("email", email.toLowerCase())
    .maybeSingle();

  if (error || !officer) {
    // Don't reveal whether the email exists — prevents account enumeration.
    return json({
      email_masked: maskEmail(email),
      sent: true,
      note: "If this email is registered, an OTP has been sent to it.",
    }, 200);
  }

  const code = String(Math.floor(100000 + Math.random() * 900000));
  const codeHash = await sha256(code);

  // Invalidate any previous unused codes for this officer
  await supabase
    .from("password_otps")
    .update({ consumed_at: new Date().toISOString() })
    .eq("officer_id", officer.id)
    .is("consumed_at", null);

  const { error: insertError } = await supabase.from("password_otps").insert({
    officer_id: officer.id,
    mobile_number: officer.email,
    code_hash: codeHash,
    purpose: "password_reset",
    expires_at: new Date(Date.now() + CODE_TTL_MINUTES * 60 * 1000).toISOString(),
  });

  if (insertError) {
    return json({ error: "Unable to generate OTP. Please try again." }, 500);
  }

  const html = `
    <div style="font-family: system-ui, Arial, sans-serif; max-width: 480px; margin: 0 auto; padding: 32px; color: #1e293b;">
      <div style="background: #1e3a5f; padding: 20px 24px; border-radius: 10px 10px 0 0; color: #ffffff;">
        <h1 style="margin: 0; font-size: 1.2rem;">KSP Crime AI</h1>
        <p style="margin: 4px 0 0; font-size: 0.82rem; opacity: 0.85;">Password Reset OTP</p>
      </div>
      <div style="border: 1px solid #e2e8f0; border-top: none; border-radius: 0 0 10px 10px; padding: 24px;">
        <p style="margin-top: 0; font-size: 0.95rem;">Dear ${escapeHtml(officer.full_name)},</p>
        <p style="font-size: 0.9rem; line-height: 1.6; color: #475569;">
          Use the code below to reset your password. It is valid for
          ${CODE_TTL_MINUTES} minutes.
        </p>
        <div style="text-align: center; margin: 20px 0;">
          <span style="display: inline-block; font-family: monospace; font-size: 2rem; font-weight: 700; letter-spacing: 0.3em; color: #1e3a5f; background: #f1f5f9; padding: 12px 24px; border-radius: 8px; border: 1px solid #e2e8f0;">
            ${code}
          </span>
        </div>
        <p style="font-size: 0.82rem; color: #64748b; line-height: 1.6; border-top: 1px solid #e2e8f0; padding-top: 16px;">
          Do not share this code with anyone. If you did not request a password
          reset, you can safely ignore this email.
        </p>
      </div>
    </div>
  `;

  await sendEmail(officer.email, "KSP Crime AI — Password Reset Code", html);

  return json({
    email_masked: maskEmail(officer.email),
    sent: true,
  }, 200);
}

async function handleVerify(
  supabase: ReturnType<typeof createClient>,
  email: string,
  code: string
) {
  if (!email || !/^\d{6}$/.test(code)) {
    return json({ error: "Invalid email or code format." }, 400);
  }

  const { data: officer } = await supabase
    .from("officer_profiles")
    .select("id")
    .eq("email", email.toLowerCase())
    .maybeSingle();

  if (!officer) {
    return json({ error: "Invalid or expired code." }, 400);
  }

  const { data: otp, error } = await supabase
    .from("password_otps")
    .select("id, code_hash, expires_at, consumed_at, attempts")
    .eq("officer_id", officer.id)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error || !otp) {
    return json({ error: "Invalid or expired code." }, 400);
  }

  if (otp.consumed_at) {
    return json({ error: "This code has already been used." }, 400);
  }
  if (new Date(otp.expires_at).getTime() < Date.now()) {
    return json({ error: "This code has expired. Please request a new one." }, 400);
  }
  if (otp.attempts >= MAX_ATTEMPTS) {
    return json({ error: "Too many attempts. Please request a new code." }, 400);
  }

  const codeHash = await sha256(code);
  if (codeHash !== otp.code_hash) {
    await supabase
      .from("password_otps")
      .update({ attempts: otp.attempts + 1 })
      .eq("id", otp.id);
    return json({ error: "Incorrect code." }, 400);
  }

  await supabase
    .from("password_otps")
    .update({ consumed_at: new Date().toISOString() })
    .eq("id", otp.id);

  return json({ verified: true }, 200);
}

async function handleReset(
  supabase: ReturnType<typeof createClient>,
  email: string,
  code: string,
  newPassword: string
) {
  if (!email || !/^\d{6}$/.test(code)) {
    return json({ error: "Invalid email or code." }, 400);
  }
  if (newPassword.length < 8) {
    return json({ error: "Password must be at least 8 characters." }, 400);
  }

  const { data: officer } = await supabase
    .from("officer_profiles")
    .select("id, email")
    .eq("email", email.toLowerCase())
    .maybeSingle();

  if (!officer) {
    return json({ error: "Account not found." }, 400);
  }

  const { data: otp } = await supabase
    .from("password_otps")
    .select("id, code_hash, expires_at, consumed_at")
    .eq("officer_id", officer.id)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (!otp || otp.consumed_at) {
    return json({ error: "Please request and verify a new OTP first." }, 400);
  }
  if (new Date(otp.expires_at).getTime() < Date.now()) {
    return json({ error: "This code has expired. Please request a new one." }, 400);
  }

  const codeHash = await sha256(code);
  if (codeHash !== otp.code_hash) {
    return json({ error: "Incorrect code." }, 400);
  }

  const { error: updateError } = await supabase.auth.admin.updateUserById(
    officer.id,
    { password: newPassword }
  );

  if (updateError) {
    return json({ error: updateError.message }, 500);
  }

  await supabase
    .from("password_otps")
    .update({ consumed_at: new Date().toISOString() })
    .eq("id", otp.id);

  return json({ ok: true }, 200);
}

function json(body: unknown, status: number) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function maskEmail(email: string): string {
  const [local, domain] = email.split("@");
  if (!domain) return "****";
  const visible = local.slice(0, 2);
  return `${visible}${"*".repeat(Math.max(local.length - 2, 2))}@${domain}`;
}

async function sha256(input: string): Promise<string> {
  const data = new TextEncoder().encode(input);
  const hashBuffer = await crypto.subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(hashBuffer))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

// Sends email via Resend (free tier — 3000 emails/month). When RESEND_API_KEY
// is configured as an edge function secret, real email is delivered.
async function sendEmail(to: string, subject: string, html: string): Promise<boolean> {
  const apiKey = Deno.env.get("RESEND_API_KEY");
  const fromEmail = Deno.env.get("RESEND_FROM_EMAIL") ?? "KSP Crime AI <noreply@ksp.gov.in>";

  if (!apiKey) {
    console.info(`[password-otp] Email (not delivered): to=${to} subject="${subject}"`);
    return false;
  }

  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: fromEmail,
        to: [to],
        subject,
        html,
      }),
    });
    return res.ok;
  } catch (err) {
    console.error(`[password-otp] Email send failed: ${(err as Error).message}`);
    return false;
  }
}
