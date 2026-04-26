import { NextRequest } from "next/server";
import { API_BASE_URL } from "@/lib/backend-api";

export async function POST(request: NextRequest) {
  const upstream = await fetch(`${API_BASE_URL}/api/investigate`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: await request.text(),
    cache: "no-store",
  });

  return new Response(upstream.body, {
    status: upstream.status,
    headers: {
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "Content-Type": upstream.headers.get("Content-Type") ?? "text/event-stream; charset=utf-8",
    },
  });
}
