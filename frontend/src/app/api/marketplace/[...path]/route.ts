import { NextRequest, NextResponse } from "next/server";
import { API_URL, SESSION_COOKIE } from "@/lib/auth";

const uuid = "[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}";

async function proxy(request: NextRequest, context: { params: Promise<{ path: string[] }> }) {
  const headers = { "Cache-Control": "no-store" };
  const { path } = await context.params;
  const target = path.join("/");
  const allowed = request.method === "GET"
    ? new RegExp(`^(vendors(?:/me|/${uuid})?|orders)$`).test(target)
    : request.method === "POST"
      ? new RegExp(`^(vendors|products|orders|farms/${uuid}/recommendations)$`).test(target)
      : request.method === "PUT"
        ? new RegExp(`^(vendors/me|products/${uuid}|orders/${uuid})$`).test(target)
        : request.method === "DELETE" && new RegExp(`^products/${uuid}$`).test(target);
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
    if (body && body.length > 32000) return NextResponse.json({ error: "Request too large." }, { status: 413, headers });
    const response = await fetch(`${API_URL}/marketplace/${target}${request.nextUrl.search}`, {
      method: request.method, headers: { Authorization: `Bearer ${token}`, ...(body ? { "Content-Type": "application/json" } : {}) },
      body, cache: "no-store", signal: AbortSignal.timeout(target.endsWith("recommendations") ? 65000 : 8000),
    });
    if (response.status === 204) return new NextResponse(null, { status: 204, headers });
    const data = await response.json();
    return NextResponse.json(data, { status: response.status, headers });
  } catch {
    return NextResponse.json({ error: "The marketplace service is unavailable." }, { status: 503, headers });
  }
}

export const GET = proxy;
export const POST = proxy;
export const PUT = proxy;
export const DELETE = proxy;