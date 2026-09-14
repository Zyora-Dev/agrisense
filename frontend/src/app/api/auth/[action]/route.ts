import { NextRequest, NextResponse } from "next/server";
import { API_URL, SESSION_COOKIE } from "@/lib/auth";

function hasSameOrigin(request: NextRequest): boolean {
  const origin = request.headers.get("origin");
  const host = request.headers.get("x-forwarded-host")?.split(",")[0].trim()
    ?? request.headers.get("host");
  if (!origin || !host) return false;

  try {
    return new URL(origin).host === host;
  } catch {
    return false;
  }
}

export async function POST(request: NextRequest, context: { params: Promise<{ action: string }> }) {
  const headers = { "Cache-Control": "no-store" };
  if (!hasSameOrigin(request)) {
    return NextResponse.json({ error: "Request not allowed." }, { status: 403, headers });
  }
  const { action } = await context.params;
  if (action === "logout") {
    const token = request.cookies.get(SESSION_COOKIE)?.value;
    if (token) {
      try {
        const upstream = await fetch(`${API_URL}/auth/logout`, {
          method: "POST", headers: { Authorization: `Bearer ${token}`, "User-Agent": request.headers.get("user-agent") ?? "Unknown browser" },
          cache: "no-store", signal: AbortSignal.timeout(8000),
        });
        if (!upstream.ok && upstream.status !== 401) throw new Error();
      } catch {
        return NextResponse.json({ error: "Sign-out could not be confirmed. Please try again." }, { status: 503, headers });
      }
    }
    const response = NextResponse.json({ ok: true }, { headers });
    response.cookies.set(SESSION_COOKIE, "", { httpOnly: true, path: "/", maxAge: 0 });
    return response;
  }
  if (action !== "login" && action !== "register") {
    return NextResponse.json({ error: "Not found." }, { status: 404, headers });
  }
  let payload: unknown;
  try { payload = await request.json(); } catch {
    return NextResponse.json({ error: "Invalid request." }, { status: 400, headers });
  }
  try {
    const upstream = await fetch(`${API_URL}/auth/${action}`, {
      method: "POST", headers: { "Content-Type": "application/json", "User-Agent": request.headers.get("user-agent") ?? "Unknown browser" },
      body: JSON.stringify(payload), cache: "no-store", signal: AbortSignal.timeout(8000),
    });
    if (!upstream.ok) {
      const messages: Record<number, string> = {
        401: "Email or password is incorrect. Please try again.",
        409: "An account with this email already exists. Please sign in.",
        422: "Check your details. Registration passwords must be 12 to 128 characters.",
        429: "Too many attempts. Please try again later.",
      };
      return NextResponse.json({ error: messages[upstream.status] ?? "We couldn't connect to your account. Please try again." }, { status: upstream.status >= 500 ? 503 : upstream.status, headers });
    }
    const data = await upstream.json();
    const response = NextResponse.json({ ok: true }, { status: action === "register" ? 201 : 200, headers });
    if (action === "login") {
      response.cookies.set(SESSION_COOKIE, data.access_token, {
        httpOnly: true, secure: process.env.NODE_ENV === "production", sameSite: "lax", path: "/", maxAge: data.expires_in,
      });
    }
    return response;
  } catch {
    return NextResponse.json({ error: "The account service is unavailable. Please try again shortly." }, { status: 503, headers });
  }
}