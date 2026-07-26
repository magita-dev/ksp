import { NextResponse } from "next/server";

export async function POST(request: Request) {
  try {
    const body = await request.json().catch(() => ({}));
    const response = NextResponse.json({ success: true, user: body.profile || null });

    // Set cookie on response header so browser cookie engine receives Set-Cookie header synchronously
    response.cookies.set("ksp_demo_session", "1", {
      path: "/",
      maxAge: 86400 * 7, // 7 days
      sameSite: "lax",
      httpOnly: false,
    });

    return response;
  } catch (error) {
    return NextResponse.json({ success: false, error: String(error) }, { status: 500 });
  }
}

export async function DELETE() {
  const response = NextResponse.json({ success: true });
  response.cookies.set("ksp_demo_session", "", {
    path: "/",
    maxAge: 0,
    sameSite: "lax",
  });
  return response;
}
