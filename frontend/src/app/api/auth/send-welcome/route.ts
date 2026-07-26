import { NextResponse } from "next/server";
import { sendEmail, getWelcomeEmailTemplate } from "@/lib/email-service";

export async function POST(request: Request) {
  try {
    const { email, profile } = await request.json();

    if (!email || !profile) {
      return NextResponse.json(
        { success: false, error: "Email and profile are required." },
        { status: 400 }
      );
    }

    const htmlContent = getWelcomeEmailTemplate(profile);

    const result = await sendEmail({
      to: email,
      subject: `[KSP INTEL] Officer Account Created - Badge ${profile.badge_number}`,
      html: htmlContent,
    });

    return NextResponse.json({
      success: true,
      emailSent: result.success,
      previewUrl: result.previewUrl,
    });
  } catch (err) {
    return NextResponse.json(
      { success: false, error: err instanceof Error ? err.message : String(err) },
      { status: 500 }
    );
  }
}
