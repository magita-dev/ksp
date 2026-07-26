import { NextResponse } from "next/server";
import { sendEmail, getOtpEmailTemplate } from "@/lib/email-service";

export async function POST(request: Request) {
  try {
    const { email, serviceId } = await request.json();

    if (!email && !serviceId) {
      return NextResponse.json(
        { success: false, error: "Email or Service ID is required." },
        { status: 400 }
      );
    }

    const targetEmail = email || (serviceId.includes("@") ? serviceId : `${serviceId}@ksp.gov.in`);
    const otpCode = Math.floor(100000 + Math.random() * 900000).toString();

    const htmlContent = getOtpEmailTemplate(otpCode, serviceId || targetEmail);

    const emailResult = await sendEmail({
      to: targetEmail,
      subject: `[KSP SECURITY] OTP Verification Code: ${otpCode}`,
      html: htmlContent,
    });

    return NextResponse.json({
      success: true,
      otp: otpCode, // For demo client verification match
      emailSent: emailResult.success,
      previewUrl: emailResult.previewUrl,
    });
  } catch (err) {
    return NextResponse.json(
      { success: false, error: err instanceof Error ? err.message : String(err) },
      { status: 500 }
    );
  }
}
