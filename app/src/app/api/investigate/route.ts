import { NextRequest } from "next/server";
import { getAgentEvents } from "@/lib/mock-graph";

export async function POST(request: NextRequest) {
  const body = (await request.json().catch(() => ({}))) as { drug?: string };
  const drug = body.drug?.trim() || "Amoxicillin";
  const encoder = new TextEncoder();
  const events = getAgentEvents(drug);

  const stream = new ReadableStream({
    async start(controller) {
      for (const event of events) {
        controller.enqueue(
          encoder.encode(`event: step\ndata: ${JSON.stringify(event)}\n\n`),
        );
        await new Promise((resolve) => setTimeout(resolve, 520));
      }

      controller.enqueue(
        encoder.encode(
          `event: done\ndata: ${JSON.stringify({
            id: "done",
            agent: "Orchestrator",
            tool: "finalizeBrief",
            message: "Investigation brief assembled. Panels are synchronized with the latest evidence graph.",
            status: "complete",
          })}\n\n`,
        ),
      );
      controller.close();
    },
  });

  return new Response(stream, {
    headers: {
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "Content-Type": "text/event-stream; charset=utf-8",
    },
  });
}
