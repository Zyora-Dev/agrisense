import { NextRequest, NextResponse } from "next/server";
import { API_URL, SESSION_COOKIE } from "@/lib/auth";

type RouteContext = { params: Promise<{ path?: string[] }> };

function allowedPath(path: string[]): boolean {
  return path.length === 1 && path[0] === "locations"
    || path.length === 2 && path[0] === "farms";
}

export async function GET(request: NextRequest, context: RouteContext) {
  const headers = { "Cache-Control": "no-store" };
  const { path = [] } = await context.params;
  if (!allowedPath(path)) return NextResponse.json({ error: "Not found." }, { status: 404, headers });
  const token = request.cookies.get(SESSION_COOKIE)?.value;
  if (!token) return NextResponse.json({ error: "Authentication required." }, { status: 401, headers });

  try {
    const query = path[0] === "locations" ? request.nextUrl.search : "";
    const upstream = await fetch(`${API_URL}/weather/${path.join("/")}${query}`, {
      headers: { Authorization: `Bearer ${token}` },
      cache: "no-store",
      signal: AbortSignal.timeout(10000),
    });
    const data = await upstream.json().catch(() => ({ detail: "Invalid service response" }));
    return NextResponse.json(data, { status: upstream.status, headers });
  } catch {
    return NextResponse.json({ error: "The weather service is unavailable." }, { status: 503, headers });
  }
}