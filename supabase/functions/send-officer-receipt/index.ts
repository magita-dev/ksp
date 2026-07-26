import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2.45.4";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

interface ReceiptRequest {
  officer_id: string;
  full_name: string;
  badge_number: string;
  tier: string;
  email: string;
  ref_id: string;
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  try {
    const body = (await req.json()) as ReceiptRequest;
    if (!body.officer_id || !body.email || !body.ref_id) {
      return json({ error: "Missing required fields." }, 400);
    }

    const tierLabels: Record<string, string> = {
      constable: "Police Constable",
      sub_inspector: "Sub-Inspector",
      inspector: "Inspector",
      dsp: "Deputy Superintendent",
      sp: "Superintendent of Police",
      ig: "Inspector General",
    };
    const rankLabel = tierLabels[body.tier] ?? body.tier;

    const html = `
      <div style="font-family: system-ui, Arial, sans-serif; max-width: 560px; margin: 0 auto; padding: 32px; color: #1e293b;">
        <div style="background: #1e3a5f; padding: 20px 24px; border-radius: 10px 10px 0 0; color: #ffffff;">
          <h1 style="margin: 0; font-size: 1.3rem; letter-spacing: -0.01em;">KSP Crime AI</h1>
          <p style="margin: 4px 0 0; font-size: 0.82rem; opacity: 0.85;">Karnataka State Police · Registration Receipt</p>
        </div>
        <div style="border: 1px solid #e2e8f0; border-top: none; border-radius: 0 0 10px 10px; padding: 24px;">
          <p style="margin-top: 0; font-size: 1rem;">Dear ${escapeHtml(body.full_name)},</p>
          <p style="font-size: 0.92rem; line-height: 1.6; color: #475569;">
            Your officer account has been successfully registered. Below is your
            registration receipt for your records.
          </p>
          <table style="width: 100%; border-collapse: collapse; margin: 16px 0; font-size: 0.9rem;">
            <tr><td style="padding: 8px 0; color: #64748b; font-weight: 600;">Name</td><td style="padding: 8px 0;">${escapeHtml(body.full_name)}</td></tr>
            <tr><td style="padding: 8px 0; color: #64748b; font-weight: 600;">Rank</td><td style="padding: 8px 0;">${escapeHtml(rankLabel)}</td></tr>
            <tr><td style="padding: 8px 0; color: #64748b; font-weight: 600;">Badge Number</td><td style="padding: 8px 0;">${escapeHtml(body.badge_number)}</td></tr>
            <tr><td style="padding: 8px 0; color: #64748b; font-weight: 600;">Reference ID</td><td style="padding: 8px 0; font-family: monospace; font-weight: 700; color: #1e3a5f;">${escapeHtml(body.ref_id)}</td></tr>
          </table>
          <p style="font-size: 0.82rem; color: #64748b; line-height: 1.6; border-top: 1px solid #e2e8f0; padding-top: 16px;">
            Please keep this reference ID for your records. You can now sign in
            to KSP Crime AI using your official email and password.
          </p>
        </div>
        <p style="text-align: center; font-size: 0.76rem; color: #94a3b8; margin-top: 16px;">
          This is an automated message from KSP Crime AI. Do not reply.
        </p>
      </div>
    `;

    const delivered = await sendEmail(body.email, "KSP Crime AI — Registration Receipt", html);

    // Log the receipt in the database for audit
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
      { auth: { persistSession: false } }
    );
    await supabase.from("password_otps").insert({
      officer_id: body.officer_id,
      mobile_number: body.email,
      code_hash: "receipt:" + body.ref_id,
      purpose: "registration_receipt",
      expires_at: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toISOString(),
    });

    return json({
      ok: true,
      ref_id: body.ref_id,
      delivered,
      note: delivered
        ? "Receipt sent to your email."
        : "Receipt recorded. Email delivery pending provider configuration.",
    }, 200);
  } catch (err) {
    return json({ error: (err as Error).message }, 500);
  }
});

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

// Sends email via Resend (free tier — 3000 emails/month). When RESEND_API_KEY
// is configured as an edge function secret, real email is delivered. Without
// it, the function logs the content and returns false so the caller knows
// delivery is pending.
async function sendEmail(to: string, subject: string, html: string): Promise<boolean> {
  const apiKey = Deno.env.get("RESEND_API_KEY");
  const fromEmail = Deno.env.get("RESEND_FROM_EMAIL") ?? "KSP Crime AI <noreply@ksp.gov.in>";

  if (!apiKey) {
    console.info(`[send-officer-receipt] Email (not delivered): to=${to} subject="${subject}"`);
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
    console.error(`[send-officer-receipt] Email send failed: ${(err as Error).message}`);
    return false;
  }
}
