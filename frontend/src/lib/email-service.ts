import nodemailer from "nodemailer";

export interface EmailOptions {
  to: string;
  subject: string;
  html: string;
  text?: string;
}

let cachedTransporter: nodemailer.Transporter | null = null;

export async function getTransporter(): Promise<nodemailer.Transporter> {
  if (cachedTransporter) return cachedTransporter;

  const host = process.env.SMTP_HOST || process.env.NODEMAILER_HOST;
  const port = parseInt(process.env.SMTP_PORT || process.env.NODEMAILER_PORT || "587", 10);
  const user = process.env.SMTP_USER || process.env.NODEMAILER_USER;
  const pass = process.env.SMTP_PASS || process.env.NODEMAILER_PASS;

  if (host && user && pass) {
    cachedTransporter = nodemailer.createTransport({
      host,
      port,
      secure: port === 465,
      auth: { user, pass },
      tls: {
        rejectUnauthorized: false,
      },
    });
    return cachedTransporter;
  }

  // Fallback to test SMTP account (Ethereal Email) or mock transporter for development
  try {
    const testAccount = await nodemailer.createTestAccount();
    cachedTransporter = nodemailer.createTransport({
      host: "smtp.ethereal.email",
      port: 587,
      secure: false,
      auth: {
        user: testAccount.user,
        pass: testAccount.pass,
      },
    });
    console.log(`[Nodemailer] Created Ethereal test account: ${testAccount.user}`);
    return cachedTransporter;
  } catch (err) {
    console.warn("[Nodemailer] Failed creating test account, using direct SMTP fallback", err);
    cachedTransporter = nodemailer.createTransport({
      jsonTransport: true,
    });
    return cachedTransporter;
  }
}

export async function sendEmail({ to, subject, html, text }: EmailOptions) {
  try {
    const transporter = await getTransporter();
    const from = process.env.SMTP_FROM || process.env.NODEMAILER_FROM || `"Karnataka State Police Intel" <noreply@ksp.gov.in>`;

    const info = await transporter.sendMail({
      from,
      to,
      subject,
      text: text || html.replace(/<[^>]+>/g, ""),
      html,
    });

    const previewUrl = nodemailer.getTestMessageUrl(info);
    if (previewUrl) {
      console.log(`[Nodemailer] Email preview URL: ${previewUrl}`);
    }

    return {
      success: true,
      messageId: info.messageId,
      previewUrl: previewUrl || null,
    };
  } catch (error) {
    console.error("[Nodemailer Error]", error);
    return {
      success: false,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

// ─── Email Templates ──────────────────────────────────────────────────────────

export function getOtpEmailTemplate(otpCode: string, serviceId: string) {
  return `
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; background-color: #0b1329; color: #e1e6f9; border: 1px solid #23345d; border-radius: 8px; padding: 24px;">
      <div style="text-align: center; border-bottom: 2px solid #b3c5ff; padding-bottom: 16px; margin-bottom: 20px;">
        <h2 style="color: #b3c5ff; margin: 0; font-size: 20px; letter-spacing: 2px;">KARNATAKA STATE POLICE</h2>
        <p style="color: #8f9bb3; font-size: 12px; margin-top: 4px; text-transform: uppercase;">INTELLIGENCE & CRIME ANALYTICS PORTAL</p>
      </div>
      
      <div style="padding: 10px 0;">
        <h3 style="color: #ffffff; font-size: 16px; margin-bottom: 12px;">SECURITY ACCESS VERIFICATION CODE</h3>
        <p style="color: #c4ceeb; font-size: 14px; line-height: 1.5;">
          Officer ID / Service Reference: <strong>${serviceId}</strong>
        </p>
        <p style="color: #c4ceeb; font-size: 14px; line-height: 1.5;">
          You requested a Secure Access Key reset. Use the following 6-digit One-Time Password (OTP) to complete verification:
        </p>
        
        <div style="background-color: #16223d; border: 1px dashed #4b67a3; text-align: center; padding: 18px; margin: 20px 0; border-radius: 6px;">
          <span style="font-family: 'Courier New', monospace; font-size: 32px; font-weight: bold; letter-spacing: 10px; color: #78a3ff;">
            ${otpCode}
          </span>
        </div>
        
        <p style="color: #ff9999; font-size: 12px; margin-top: 10px;">
          ⚠️ This code expires in 3 minutes. Do not share this OTP with anyone under any circumstances.
        </p>
      </div>
      
      <div style="border-top: 1px solid #23345d; padding-top: 16px; margin-top: 24px; font-size: 11px; color: #7b88a8; text-align: center;">
        <p style="margin: 2px 0;">Official Communication of Karnataka Police Department.</p>
        <p style="margin: 2px 0;">Encrypted via AES-256 Protocol | Cyber Crime Cell Bengaluru</p>
      </div>
    </div>
  `;
}

export function getWelcomeEmailTemplate(profile: { full_name: string; badge_number: string; tier: string; department: string }) {
  return `
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; background-color: #0b1329; color: #e1e6f9; border: 1px solid #23345d; border-radius: 8px; padding: 24px;">
      <div style="text-align: center; border-bottom: 2px solid #b3c5ff; padding-bottom: 16px; margin-bottom: 20px;">
        <h2 style="color: #b3c5ff; margin: 0; font-size: 20px; letter-spacing: 2px;">KARNATAKA STATE POLICE</h2>
        <p style="color: #8f9bb3; font-size: 12px; margin-top: 4px; text-transform: uppercase;">OFFICER REGISTRATION CONFIRMED</p>
      </div>

      <div style="padding: 10px 0;">
        <p style="color: #ffffff; font-size: 15px;">Dear <strong>${profile.full_name}</strong>,</p>
        <p style="color: #c4ceeb; font-size: 14px; line-height: 1.5;">
          Your official account has been successfully provisioned in the Karnataka Police Intelligence Portal.
        </p>

        <div style="background-color: #121c33; border-left: 4px solid #78a3ff; padding: 16px; margin: 20px 0; border-radius: 4px;">
          <p style="margin: 4px 0; font-size: 13px;"><strong>BADGE NUMBER:</strong> ${profile.badge_number}</p>
          <p style="margin: 4px 0; font-size: 13px;"><strong>CLEARANCE TIER:</strong> ${profile.tier.toUpperCase()}</p>
          <p style="margin: 4px 0; font-size: 13px;"><strong>DEPARTMENT / STATION:</strong> ${profile.department}</p>
        </div>

        <p style="color: #c4ceeb; font-size: 13px; line-height: 1.5;">
          You can now log in using your registered email or Badge Number (${profile.badge_number}) at the Karnataka Police Intelligence Terminal.
        </p>
      </div>

      <div style="border-top: 1px solid #23345d; padding-top: 16px; margin-top: 24px; font-size: 11px; color: #7b88a8; text-align: center;">
        <p style="margin: 2px 0;">Karnataka State Police Digital Terminal · Encrypted Node</p>
      </div>
    </div>
  `;
}
