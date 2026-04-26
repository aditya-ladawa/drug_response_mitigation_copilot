import { NextRequest } from "next/server";
import { API_BASE_URL } from "@/lib/backend-api";

export async function GET(
  request: NextRequest,
  context: { params: Promise<{ name: string }> },
) {
  const { name } = await context.params;
  const depth = request.nextUrl.searchParams.get("depth") ?? "3";
  const upstream = await fetch(
    `${API_BASE_URL}/api/graph/drug/${encodeURIComponent(name)}?depth=${encodeURIComponent(depth)}`,
    { cache: "no-store" },
  );

  return new Response(upstream.body, {
    status: upstream.status,
    headers: {
      "Cache-Control": "no-store",
      "Content-Type": upstream.headers.get("Content-Type") ?? "application/json",
    },
  });
}
