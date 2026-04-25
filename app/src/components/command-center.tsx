"use client";

import dynamic from "next/dynamic";
import { motion } from "framer-motion";
import {
  Activity,
  ArrowRight,
  BrainCircuit,
  CircleAlert,
  Network,
  Radio,
  Search,
  Sparkles,
} from "lucide-react";
import { FormEvent, useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { ComponentType, Ref } from "react";
import ReactBitsAurora from "@/components/react-bits-aurora";
import type {
  AgentEvent,
  CopilotGraph,
  CopilotLink,
  CopilotNode,
  GlobePoint,
  SupplyArc,
} from "@/types/copilot";

type GlobeMethods = {
  controls: () => { autoRotate: boolean; autoRotateSpeed: number };
  pointOfView: (
    view: { lat: number; lng: number; altitude: number },
    transitionMs?: number,
  ) => void;
};

type GlobeProps = {
  ref?: Ref<GlobeMethods>;
  width: number;
  height: number;
  backgroundColor: string;
  backgroundImageUrl?: string;
  globeImageUrl: string;
  bumpImageUrl?: string;
  showAtmosphere?: boolean;
  atmosphereColor: string;
  atmosphereAltitude: number;
  globeCurvatureResolution?: number;
  waitForGlobeReady?: boolean;
  animateIn?: boolean;
  pointsData: GlobePoint[];
  pointLat: string;
  pointLng: string;
  pointColor: (point: GlobePoint) => string;
  pointAltitude: (point: GlobePoint) => number;
  pointRadius: (point: GlobePoint) => number;
  pointResolution?: number;
  pointsTransitionDuration?: number;
  pointLabel: (point: GlobePoint) => string;
  arcsData: SupplyArc[];
  arcStartLat: string;
  arcStartLng: string;
  arcEndLat: string;
  arcEndLng: string;
  arcColor: (arc: SupplyArc) => string[];
  arcAltitudeAutoScale?: number;
  arcCurveResolution?: number;
  arcCircularResolution?: number;
  arcDashLength: number;
  arcDashGap: number;
  arcDashAnimateTime: number;
  arcStroke: number;
  ringsData: GlobePoint[];
  ringLat: string;
  ringLng: string;
  ringColor: () => (time: number) => string;
  ringMaxRadius: number;
  ringPropagationSpeed: number;
  ringRepeatPeriod: number;
};

type ForceGraphProps = {
  width: number;
  height: number;
  graphData: { nodes: CopilotNode[]; links: CopilotLink[] };
  backgroundColor: string;
  nodeRelSize: number;
  linkDirectionalParticles: number;
  linkDirectionalParticleSpeed: number;
  linkDirectionalArrowLength: number;
  linkDirectionalArrowRelPos: number;
  cooldownTicks: number;
  nodeCanvasObject: (
    node: CopilotNode,
    ctx: CanvasRenderingContext2D,
    globalScale: number,
  ) => void;
  linkColor: (link: CopilotLink) => string;
  linkLabel: (link: CopilotLink) => string;
  nodePointerAreaPaint: (
    node: CopilotNode,
    color: string,
    ctx: CanvasRenderingContext2D,
  ) => void;
};

const Globe = dynamic(() => import("react-globe.gl"), {
  ssr: false,
}) as unknown as ComponentType<GlobeProps>;

const ForceGraph2D = dynamic(() => import("react-force-graph-2d"), {
  ssr: false,
}) as unknown as ComponentType<ForceGraphProps>;

const globeImageUrl = "https://unpkg.com/three-globe/example/img/earth-blue-marble.jpg";
const globeBumpUrl = "https://unpkg.com/three-globe/example/img/earth-topology.png";
const globeStarsUrl = "https://unpkg.com/three-globe/example/img/night-sky.png";

const fallbackGraph: CopilotGraph = {
  drug: "Amoxicillin",
  summary: "Ready to investigate a shortage.",
  nodes: [],
  links: [],
};

function useElementSize<T extends HTMLElement>() {
  const [element, setElement] = useState<T | null>(null);
  const [size, setSize] = useState({ width: 640, height: 420 });

  useEffect(() => {
    if (!element) return;

    const update = () => {
      const rect = element.getBoundingClientRect();
      setSize({
        width: Math.max(280, Math.floor(rect.width)),
        height: Math.max(260, Math.floor(rect.height)),
      });
    };

    update();
    const observer = new ResizeObserver(update);
    observer.observe(element);

    return () => observer.disconnect();
  }, [element]);

  return [setElement, size] as const;
}

function plantNodes(graph: CopilotGraph): GlobePoint[] {
  return graph.nodes.filter(
    (node): node is GlobePoint =>
      node.type === "plant" && typeof node.lat === "number" && typeof node.lng === "number",
  );
}

function supplyArcs(points: GlobePoint[]): SupplyArc[] {
  if (points.length < 2) return [];

  return points.slice(1).map((point) => ({
    startLat: point.lat,
    startLng: point.lng,
    endLat: points[0].lat,
    endLng: points[0].lng,
    color: ["rgba(52, 211, 153, 0.12)", "rgba(251, 113, 133, 0.92)"],
    label: `${point.name} -> ${points[0].name}`,
  }));
}

function statusTone(status: AgentEvent["status"]) {
  if (status === "warning") return "border-rose-400/50 bg-rose-500/10 text-rose-100";
  if (status === "running") return "border-cyan-400/50 bg-cyan-500/10 text-cyan-100";
  return "border-emerald-400/35 bg-emerald-500/10 text-emerald-100";
}

function getNodeRadius(node: CopilotNode) {
  if (node.type === "drug") return 8;
  if (node.type === "plant") return node.risk === "high" ? 7 : 5.5;
  return 4.8;
}

export default function CommandCenter() {
  const [query, setQuery] = useState("Amoxicillin");
  const [graph, setGraph] = useState<CopilotGraph>(fallbackGraph);
  const [events, setEvents] = useState<AgentEvent[]>([]);
  const [isInvestigating, setIsInvestigating] = useState(false);
  const globeRef = useRef<GlobeMethods | null>(null);
  const [setGlobeElement, globeSize] = useElementSize<HTMLDivElement>();
  const [setGraphElement, graphSize] = useElementSize<HTMLDivElement>();

  const points = useMemo(() => plantNodes(graph), [graph]);
  const arcs = useMemo(() => supplyArcs(points), [points]);
  const problemPoints = useMemo(
    () => points.filter((point) => point.risk === "high"),
    [points],
  );
  const activePoint = useMemo(
    () => problemPoints[0] ?? points[0] ?? null,
    [points, problemPoints],
  );

  const graphData = useMemo(
    () => ({
      nodes: graph.nodes.map((node) => ({ ...node })),
      links: graph.links.map((link) => ({ ...link })),
    }),
    [graph],
  );

  useEffect(() => {
    const controls = globeRef.current?.controls();
    if (controls) {
      controls.autoRotate = true;
      controls.autoRotateSpeed = 0.45;
    }
  }, [graph.drug]);

  useEffect(() => {
    if (!activePoint) return;

    globeRef.current?.pointOfView(
      { lat: activePoint.lat, lng: activePoint.lng, altitude: 1.8 },
      1200,
    );
  }, [activePoint]);

  const loadGraph = useCallback(async (drug: string) => {
    const response = await fetch(`/api/graph/drug/${encodeURIComponent(drug)}?depth=2`);
    if (!response.ok) throw new Error("Graph request failed");
    const nextGraph = (await response.json()) as CopilotGraph;
    setGraph(nextGraph);
  }, []);

  const streamInvestigation = useCallback(async (drug: string) => {
    const response = await fetch("/api/investigate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ drug }),
    });

    if (!response.body) return;

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const chunks = buffer.split("\n\n");
      buffer = chunks.pop() ?? "";

      for (const chunk of chunks) {
        const dataLine = chunk
          .split("\n")
          .find((line) => line.startsWith("data: "));
        if (!dataLine) continue;

        const event = JSON.parse(dataLine.replace("data: ", "")) as AgentEvent;
        setEvents((current) => [event, ...current].slice(0, 8));
      }
    }
  }, []);

  const investigate = useCallback(async (drug: string) => {
    setIsInvestigating(true);
    setEvents([
      {
        id: "queued",
        agent: "Orchestrator",
        tool: "startInvestigation",
        message: `Launching shortage investigation for ${drug}.`,
        status: "running",
      },
    ]);

    try {
      await loadGraph(drug);
      await streamInvestigation(drug);
    } finally {
      setIsInvestigating(false);
    }
  }, [loadGraph, streamInvestigation]);

  function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const drug = query.trim() || "Amoxicillin";
    void investigate(drug);
  }

  useEffect(() => {
    const timer = window.setTimeout(() => {
      void investigate("Amoxicillin");
    }, 0);

    return () => window.clearTimeout(timer);
  }, [investigate]);

  return (
    <main className="command-shell relative min-h-screen overflow-hidden bg-[#030508] text-white">
      <ReactBitsAurora />

      <section className="command-stage">
        <header className="command-topbar">
          <div className="min-w-0">
            <div className="flex items-center gap-3">
              <div className="grid h-10 w-10 shrink-0 place-items-center rounded-md bg-white text-xs font-black text-black">
                Rx
              </div>
              <div className="min-w-0">
                <h1 className="truncate text-lg font-semibold tracking-tight">Drug Shortage Copilot</h1>
                <p className="truncate text-xs text-white/48">Investigate. Map. Stream. Mitigate.</p>
              </div>
            </div>
          </div>

          <div className="flex min-w-0 shrink-0 items-center gap-2 text-xs text-white/52">
            <span className="hidden items-center gap-2 rounded-full border border-white/12 px-3 py-2 md:flex">
              <Radio className="h-3.5 w-3.5 text-emerald-300" />
              Graph API live
            </span>
            <span className="hidden rounded-full border border-white/12 px-3 py-2 sm:inline-flex">
              dark theme
            </span>
          </div>
        </header>

        <section className="command-search-panel">
          <div>
            <p className="mb-2 flex items-center gap-2 text-sm font-medium text-white/80 lg:mb-1">
              <Sparkles className="h-4 w-4 text-cyan-200" />
              Investigate a drug shortage:
            </p>
            <form onSubmit={onSubmit} className="flex min-w-0 flex-col gap-3 sm:flex-row">
              <label className="relative min-w-0 flex-1">
                <Search className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-white/36" />
                <input
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
                  placeholder="e.g. Amoxicillin, Adderall, Vincristine"
                  className="h-12 w-full rounded-md border border-white/14 bg-white/[0.055] pl-11 pr-4 text-sm text-white outline-none transition focus:border-cyan-300/70 lg:h-11"
                />
              </label>
              <button
                type="submit"
                disabled={isInvestigating}
                className="inline-flex h-12 items-center justify-center gap-2 rounded-md bg-white px-5 text-sm font-semibold text-black transition hover:bg-cyan-100 disabled:cursor-not-allowed disabled:opacity-60 lg:h-11"
              >
                {isInvestigating ? "Running" : "Go"}
                <ArrowRight className="h-4 w-4" />
              </button>
            </form>
          </div>
          <div className="grid gap-2 text-xs text-white/52 md:grid-cols-3">
            {["pins = plants", "arcs = supply flow", "red pulse = problem site"].map((item) => (
              <span key={item} className="rounded-md border border-white/10 bg-white/[0.04] px-3 py-2">
                {item}
              </span>
            ))}
          </div>
        </section>

        <section className="command-main-grid">
          <article className="command-panel globe-panel">
            <div className="panel-title">
              <span>
                <Activity className="h-4 w-4 text-cyan-200" />
                3D Globe
              </span>
              <span>{activePoint?.name ?? "Waiting for plant signal"}</span>
            </div>
            <div ref={setGlobeElement} className="globe-viewport">
              <div className="globe-reflection" aria-hidden="true" />
              <div className="globe-scanline" aria-hidden="true" />
              {globeSize.width > 0 ? (
                <Globe
                  ref={globeRef}
                  width={globeSize.width}
                  height={globeSize.height}
                  backgroundColor="rgba(0,0,0,0)"
                  backgroundImageUrl={globeStarsUrl}
                  globeImageUrl={globeImageUrl}
                  bumpImageUrl={globeBumpUrl}
                  showAtmosphere
                  atmosphereColor="#f8fafc"
                  atmosphereAltitude={0.12}
                  globeCurvatureResolution={3}
                  waitForGlobeReady
                  animateIn
                  pointsData={points}
                  pointLat="lat"
                  pointLng="lng"
                  pointColor={(point) => (point.risk === "high" ? "#fb7185" : "#67e8f9")}
                  pointAltitude={(point) => (point.risk === "high" ? 0.12 : 0.06)}
                  pointRadius={(point) => (point.risk === "high" ? 0.42 : 0.26)}
                  pointResolution={18}
                  pointsTransitionDuration={900}
                  pointLabel={(point) => `${point.name}<br/>${point.description ?? "Manufacturing signal"}`}
                  arcsData={arcs}
                  arcStartLat="startLat"
                  arcStartLng="startLng"
                  arcEndLat="endLat"
                  arcEndLng="endLng"
                  arcColor={(arc) => arc.color}
                  arcAltitudeAutoScale={0.42}
                  arcCurveResolution={96}
                  arcCircularResolution={8}
                  arcDashLength={0.42}
                  arcDashGap={1.4}
                  arcDashAnimateTime={1800}
                  arcStroke={0.8}
                  ringsData={problemPoints}
                  ringLat="lat"
                  ringLng="lng"
                  ringColor={() => (time) => `rgba(251, 113, 133, ${1 - time})`}
                  ringMaxRadius={6}
                  ringPropagationSpeed={1.8}
                  ringRepeatPeriod={900}
                />
              ) : null}
            </div>
          </article>

          <div className="command-side-grid">
            <article className="command-panel">
              <div className="panel-title">
                <span>
                  <Network className="h-4 w-4 text-violet-200" />
                  Knowledge Graph Panel
                </span>
                <span>{graph.nodes.length} nodes / {graph.links.length} links</span>
              </div>
              <div ref={setGraphElement} className="graph-viewport">
                {graphSize.width > 0 ? (
                  <ForceGraph2D
                    width={graphSize.width}
                    height={graphSize.height}
                    graphData={graphData}
                    backgroundColor="rgba(0,0,0,0)"
                    nodeRelSize={5}
                    linkDirectionalParticles={2}
                    linkDirectionalParticleSpeed={0.006}
                    linkDirectionalArrowLength={4}
                    linkDirectionalArrowRelPos={0.92}
                    cooldownTicks={90}
                    linkColor={(link) => link.color ?? "rgba(255,255,255,0.22)"}
                    linkLabel={(link) => link.label ?? ""}
                    nodePointerAreaPaint={(node, color, ctx) => {
                      ctx.fillStyle = color;
                      ctx.beginPath();
                      ctx.arc(node.x ?? 0, node.y ?? 0, getNodeRadius(node) + 4, 0, 2 * Math.PI);
                      ctx.fill();
                    }}
                    nodeCanvasObject={(node, ctx, globalScale) => {
                      const radius = getNodeRadius(node);
                      const x = node.x ?? 0;
                      const y = node.y ?? 0;
                      ctx.beginPath();
                      ctx.arc(x, y, radius, 0, 2 * Math.PI);
                      ctx.fillStyle = node.color ?? "#ffffff";
                      ctx.shadowColor = node.color ?? "#ffffff";
                      ctx.shadowBlur = node.risk === "high" ? 18 : 8;
                      ctx.fill();
                      ctx.shadowBlur = 0;

                      const label = node.name;
                      const fontSize = Math.max(5.5, 9 / globalScale);
                      ctx.font = `${fontSize}px Inter, Segoe UI, sans-serif`;
                      ctx.textAlign = "center";
                      ctx.fillStyle = "rgba(255,255,255,0.72)";
                      ctx.fillText(label, x, y + radius + fontSize + 3);
                    }}
                  />
                ) : null}
              </div>
            </article>

            <article className="command-panel">
              <div className="panel-title">
                <span>
                  <BrainCircuit className="h-4 w-4 text-emerald-200" />
                  Chat / Agent Stream Panel
                </span>
                <span>{isInvestigating ? "streaming" : "idle"}</span>
              </div>
              <div className="agent-stream flex-1 space-y-3 overflow-auto pr-1">
                <div className="rounded-md border border-white/10 bg-white/[0.035] p-4 text-sm leading-6 text-white/68">
                  <span className="font-semibold text-white">Agent:</span> {graph.summary}
                </div>
                {events.map((event) => (
                  <motion.div
                    key={event.id}
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    className={`rounded-md border p-3 ${statusTone(event.status)}`}
                  >
                    <div className="mb-2 flex items-center justify-between gap-3">
                      <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.14em]">
                        <CircleAlert className="h-3.5 w-3.5" />
                        {event.agent}
                      </div>
                      <span className="rounded-full bg-black/24 px-2 py-1 font-mono text-[10px]">
                        {event.tool}
                      </span>
                    </div>
                    <p className="text-sm leading-6">{event.message}</p>
                  </motion.div>
                ))}
              </div>
            </article>
          </div>
        </section>
      </section>
    </main>
  );
}
