import { apiUrl } from "@/lib/backend-api";

export async function GET() {
  const upstream = await fetch(apiUrl("/health"), { cache: "no-store" });

  return new Response(upstream.body, {
    status: upstream.status,
    headers: {
      "Cache-Control": "no-store",
      "Content-Type": upstream.headers.get("Content-Type") ?? "application/json",
    },
  });
}
