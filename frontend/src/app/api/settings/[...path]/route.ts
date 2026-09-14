import { NextRequest, NextResponse } from "next/server";
import { API_URL, SESSION_COOKIE } from "@/lib/auth";

async function proxy(request: NextRequest, context: { params: Promise<{ path: string[] }> }) {
  const headers = { "Cache-Control": "no-store" };
  const { path } = await context.params;
  const target = path.join("/");
  const allowed = request.method === "GET" ? ["sessions", "audit"].includes(target)
    : request.method === "PUT" ? target === "profile"
      : request.method === "POST" ? ["password", "sessions/revoke-others"].includes(target)
        : request.method === "DELETE" && /^sessions\/[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/.test(target);
  if (!allowed) return NextResponse.json({ error: "Not found." }, { status: 404, headers });
  if (request.method !== "GET") {
    const origin = request.headers.get("origin");
    const host = request.headers.get("x-forwarded-host")?.split(",")[0].trim() ?? request.headers.get("host");
    try {
      if (!origin || new URL(origin).host !== host) throw new Error();
    } catch {
      return NextResponse.json({ error: "Request not allowed." }, { status: 403, headers });
    }
  }
  const token = request.cookies.get(SESSION_COOKIE)?.value;
  if (!token) return NextResponse.json({ error: "Authentication required." }, { status: 401, headers });
  try {
    const body = ["GET", "DELETE"].includes(request.method) ? undefined : await request.text();
    if (body && body.length > 4000) return NextResponse.json({ error: "Request too large." }, { status: 413, headers });
    const upstream = await fetch(`${API_URL}/auth/${target}${request.nextUrl.search}`, {
      method: request.method,
      headers: { Authorization: `Bearer ${token}`, "User-Agent": request.headers.get("user-agent") ?? "Unknown browser", ...(body ? { "Content-Type": "application/json" } : {}) },
      body, cache: "no-store", signal: AbortSignal.timeout(8000),
    });
    const response = upstream.status === 204
      ? new NextResponse(null, { status: 204, headers })
      : NextResponse.json(await upstream.json(), { status: upstream.status, headers });
    if (upstream.status === 401 || (target === "password" && upstream.ok)) {
      response.cookies.set(SESSION_COOKIE, "", { httpOnly: true, path: "/", maxAge: 0 });
    }
    return response;
  } catch {
    return NextResponse.json({ error: "The account service is unavailable. Please try again." }, { status: 503, headers });
  }
}

export const GET = proxy;
export const PUT = proxy;
export const POST = proxy;
export const DELETE = proxy;