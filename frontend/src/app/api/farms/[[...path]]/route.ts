import { NextRequest, NextResponse } from "next/server";
import { API_URL, SESSION_COOKIE } from "@/lib/auth";

type RouteContext = { params: Promise<{ path?: string[] }> };

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

function allowedPath(path: string[], method: string): boolean {
  if (path.length === 0) return method === "GET" || method === "POST";
  if (path.length === 1) return ["GET", "PATCH", "DELETE"].includes(method);
  if (path.length === 2 && path[1] === "devices") return method === "GET" || method === "POST";
  if (path.length === 2 && path[1] === "readings") return method === "GET" || method === "POST";
  if (path.length === 2 && path[1] === "analysis") return method === "GET";
  if (path.length === 2 && path[1] === "recommendations") return method === "GET" || method === "POST";
  if (path.length === 2 && path[1] === "chat") return method === "POST";
  return path.length === 3 && path[1] === "readings" && path[2] === "latest" && method === "GET";
}

async function proxy(request: NextRequest, context: RouteContext) {
  const headers = { "Cache-Control": "no-store" };
  const { path = [] } = await context.params;
  if (!allowedPath(path, request.method)) {
    return NextResponse.json({ error: "Not found." }, { status: 404, headers });
  }
  if (request.method !== "GET" && !hasSameOrigin(request)) {
    return NextResponse.json({ error: "Request not allowed." }, { status: 403, headers });
  }
  const token = request.cookies.get(SESSION_COOKIE)?.value;
  if (!token) {
    return NextResponse.json({ error: "Authentication required." }, { status: 401, headers });
  }

  try {
    const body = request.method === "GET" || request.method === "DELETE"
      ? undefined
      : await request.text();
    const suffix = path.length ? path.join("/") : "";
    const upstream = await fetch(`${API_URL}/farms/${suffix}${request.nextUrl.search}`, {
      method: request.method,
      headers: {
        Authorization: `Bearer ${token}`,
        ...(body ? { "Content-Type": "application/json" } : {}),
      },
      body,
      cache: "no-store",
      signal: AbortSignal.timeout(path[1] === "recommendations" || path[1] === "chat" ? 65000 : 8000),
    });
    if (upstream.status === 204) return new NextResponse(null, { status: 204, headers });
    const data = await upstream.json().catch(() => ({ detail: "Invalid service response" }));
    return NextResponse.json(data, { status: upstream.status, headers });
  } catch {
    return NextResponse.json({ error: "The farm service is unavailable." }, { status: 503, headers });
  }
}

export const GET = proxy;
export const POST = proxy;
export const PATCH = proxy;
export const DELETE = proxy;