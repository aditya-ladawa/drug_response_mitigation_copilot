import { NextRequest, NextResponse } from "next/server";
import { getMockGraph } from "@/lib/mock-graph";

export async function GET(
  _request: NextRequest,
  context: { params: Promise<{ name: string }> },
) {
  const { name } = await context.params;

  return NextResponse.json(getMockGraph(name));
}
