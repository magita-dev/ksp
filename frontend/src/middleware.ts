import { createServerClient } from "@supabase/ssr";
import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

export async function middleware(req: NextRequest) {
  const res = NextResponse.next();
  const { pathname } = req.nextUrl;
  const isAuthRoute =
    pathname === "/login" ||
    pathname === "/signup" ||
    pathname === "/forgot-password";

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  // Check demo session cookie first
  const demoCookie = req.cookies.get("ksp_demo_session")?.value;
  if (demoCookie) {
    if (isAuthRoute) {
      return NextResponse.redirect(new URL("/", req.url));
    }
    return res;
  }

  // If Supabase keys are missing, allow browsing
  if (!url || !key) {
    return res;
  }

  try {
    const supabase = createServerClient(url, key, {
      cookies: {
        get(name: string) {
          return req.cookies.get(name)?.value;
        },
        set(name: string, value: string, options: Record<string, unknown>) {
          res.cookies.set(name, value, options);
        },
        remove(name: string, options: Record<string, unknown>) {
          res.cookies.set(name, "", { ...options, maxAge: 0 });
        },
      },
    });

    const {
      data: { session },
    } = await supabase.auth.getSession();

    if (session && isAuthRoute) {
      if (pathname === "/signup") {
        const { data: existing } = await supabase
          .from("officer_profiles")
          .select("id")
          .eq("id", session.user.id)
          .maybeSingle();
        if (!existing) return res;
      }
      return NextResponse.redirect(new URL("/", req.url));
    }
  } catch (e) {
    console.error("Middleware Supabase error:", e);
  }

  return res;
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|api).*)"],
};

