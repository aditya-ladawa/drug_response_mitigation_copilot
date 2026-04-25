"use client";

import dynamic from "next/dynamic";
import { motion } from "framer-motion";
import {
  Activity,
  ArrowRight,
  BrainCircuit,
  CheckCircle2,
  CircleAlert,
  Clock3,
  Expand,
  Factory,
  Filter,
  Gauge,
  Info,
  Layers3,
  Network,
  Search,
  ShieldCheck,
  Shrink,
  X,
} from "lucide-react";
import { FormEvent, useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { ComponentType, CSSProperties, PointerEvent as ReactPointerEvent, Ref } from "react";
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
  onPointClick?: (point: GlobePoint) => void;
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
  onNodeClick: (node: CopilotNode) => void;
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
  metrics: {
    riskLevel: "medium",
    riskScore: 0,
    affectedSupply: 0,
    confidence: 0,
    primaryPlant: "Pending signal",
    eta: "Pending",
    substitutes: 0,
  },
  recommendations: [],
  nodes: [],
  links: [],
};

const graphFilters = [
  { id: "all", label: "All" },
  { id: "plant", label: "Plants" },
  { id: "manufacturer", label: "Manufacturers" },
  { id: "regulatory", label: "FDA Signals" },
  { id: "supply", label: "Supply Chain" },
] as const;

type GraphFilter = (typeof graphFilters)[number]["id"];
type GlobeViewMode = "2d" | "3d";

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

function projectGeoPoint(lat: number, lng: number) {
  return {
    x: ((lng + 180) / 360) * 100,
    y: ((90 - lat) / 180) * 100,
  };
}

function flatArcPath(arc: SupplyArc) {
  const start = projectGeoPoint(arc.startLat, arc.startLng);
  const end = projectGeoPoint(arc.endLat, arc.endLng);
  const control = {
    x: (start.x + end.x) / 2,
    y: Math.min(start.y, end.y) - Math.min(18, Math.abs(start.x - end.x) * 0.16 + 7),
  };

  return `M ${start.x.toFixed(2)} ${start.y.toFixed(2)} Q ${control.x.toFixed(2)} ${control.y.toFixed(2)} ${end.x.toFixed(2)} ${end.y.toFixed(2)}`;
}

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

function nodeMatchesFilter(node: CopilotNode, filter: GraphFilter) {
  if (filter === "all") return true;
  if (filter === "plant") return node.type === "plant";
  if (filter === "manufacturer") return node.type === "manufacturer";
  if (filter === "regulatory") {
    return ["shortage", "warning", "recall"].includes(node.type);
  }
  return ["drug", "ingredient", "manufacturer", "plant"].includes(node.type);
}

function linkEndpointId(endpoint: CopilotLink["source"] | CopilotLink["target"]) {
  return typeof endpoint === "string" ? endpoint : endpoint.id;
}

function formatEventTime(timestamp: string) {
  return new Intl.DateTimeFormat("en-US", {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  }).format(new Date(timestamp));
}

export default function CommandCenter() {
  const [query, setQuery] = useState("Amoxicillin");
  const [graph, setGraph] = useState<CopilotGraph>(fallbackGraph);
  const [events, setEvents] = useState<AgentEvent[]>([]);
  const [isInvestigating, setIsInvestigating] = useState(false);
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
  const [graphFilter, setGraphFilter] = useState<GraphFilter>("all");
  const [isGlobeExpanded, setIsGlobeExpanded] = useState(false);
  const [globeView, setGlobeView] = useState<GlobeViewMode>("3d");
  const [mainSplit, setMainSplit] = useState(50);
  const [rightSplit, setRightSplit] = useState(48);
  const globeRef = useRef<GlobeMethods | null>(null);
  const mainGridRef = useRef<HTMLElement | null>(null);
  const sideGridRef = useRef<HTMLDivElement | null>(null);
  const [setGlobeElement, globeSize] = useElementSize<HTMLDivElement>();
  const [setGraphElement, graphSize] = useElementSize<HTMLDivElement>();

  const points = useMemo(() => plantNodes(graph), [graph]);
  const arcs = useMemo(() => supplyArcs(points), [points]);
  const problemPoints = useMemo(
    () => points.filter((point) => point.risk === "high"),
    [points],
  );
  const selectedNode = useMemo(
    () => graph.nodes.find((node) => node.id === selectedNodeId) ?? null,
    [graph.nodes, selectedNodeId],
  );
  const selectedPoint = useMemo(
    () =>
      selectedNode?.type === "plant" &&
      typeof selectedNode.lat === "number" &&
      typeof selectedNode.lng === "number"
        ? (selectedNode as GlobePoint)
        : null,
    [selectedNode],
  );
  const activePoint = useMemo(
    () => selectedPoint ?? problemPoints[0] ?? points[0] ?? null,
    [points, problemPoints, selectedPoint],
  );
  const ringPoints = useMemo(() => {
    const byId = new Map<string, GlobePoint>();
    for (const point of [...problemPoints, ...(selectedPoint ? [selectedPoint] : [])]) {
      byId.set(point.id, point);
    }
    return [...byId.values()];
  }, [problemPoints, selectedPoint]);

  const graphData = useMemo(
    () => {
      const nodes = graph.nodes
        .filter((node) => nodeMatchesFilter(node, graphFilter))
        .map((node) => ({ ...node }));
      const nodeIds = new Set(nodes.map((node) => node.id));
      const links = graph.links
        .filter((link) => nodeIds.has(linkEndpointId(link.source)) && nodeIds.has(linkEndpointId(link.target)))
        .map((link) => ({ ...link }));

      return { nodes, links };
    },
    [graph, graphFilter],
  );
  const visibleNodeCount = graphData.nodes.length;
  const visibleLinkCount = graphData.links.length;
  const mainGridStyle = {
    "--main-split": `${mainSplit}%`,
  } as CSSProperties;
  const sideGridStyle = {
    "--graph-split": `${rightSplit}%`,
  } as CSSProperties;

  useEffect(() => {
    if (globeView !== "3d") return;

    const controls = globeRef.current?.controls();
    if (controls) {
      controls.autoRotate = true;
      controls.autoRotateSpeed = 0.45;
    }
  }, [globeView, graph.drug]);

  useEffect(() => {
    if (!activePoint || globeView !== "3d") return;

    globeRef.current?.pointOfView(
      { lat: activePoint.lat, lng: activePoint.lng, altitude: 1.8 },
      1200,
    );
  }, [activePoint, globeView]);

  const loadGraph = useCallback(async (drug: string) => {
    const response = await fetch(`/api/graph/drug/${encodeURIComponent(drug)}?depth=2`);
    if (!response.ok) throw new Error("Graph request failed");
    const nextGraph = (await response.json()) as CopilotGraph;
    setGraph(nextGraph);
    setSelectedNodeId(
      nextGraph.nodes.find((node) => node.type === "plant" && node.risk === "high")?.id ??
        nextGraph.nodes[0]?.id ??
        null,
    );
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
    setGraphFilter("all");
    setEvents([
      {
        id: "queued",
        agent: "Orchestrator",
        tool: "startInvestigation",
        message: `Launching shortage investigation for ${drug}.`,
        status: "running",
        timestamp: new Date().toISOString(),
        confidence: 0.68,
        source: "User request",
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

  const startMainResize = useCallback((event: ReactPointerEvent<HTMLButtonElement>) => {
    event.preventDefault();
    const grid = mainGridRef.current;
    if (!grid) return;

    const update = (pointerEvent: PointerEvent) => {
      const rect = grid.getBoundingClientRect();
      const nextSplit = ((pointerEvent.clientX - rect.left) / rect.width) * 100;
      setMainSplit(clamp(nextSplit, 40, 62));
    };
    const stop = () => {
      document.body.classList.remove("is-resizing-layout");
      window.removeEventListener("pointermove", update);
      window.removeEventListener("pointerup", stop);
    };

    document.body.classList.add("is-resizing-layout");
    window.addEventListener("pointermove", update);
    window.addEventListener("pointerup", stop, { once: true });
    update(event.nativeEvent);
  }, []);

  const startRightResize = useCallback((event: ReactPointerEvent<HTMLButtonElement>) => {
    event.preventDefault();
    const grid = sideGridRef.current;
    if (!grid) return;

    const update = (pointerEvent: PointerEvent) => {
      const rect = grid.getBoundingClientRect();
      const nextSplit = ((pointerEvent.clientY - rect.top) / rect.height) * 100;
      setRightSplit(clamp(nextSplit, 34, 66));
    };
    const stop = () => {
      document.body.classList.remove("is-resizing-layout");
      window.removeEventListener("pointermove", update);
      window.removeEventListener("pointerup", stop);
    };

    document.body.classList.add("is-resizing-layout");
    window.addEventListener("pointermove", update);
    window.addEventListener("pointerup", stop, { once: true });
    update(event.nativeEvent);
  }, []);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      void investigate("Amoxicillin");
    }, 0);

    return () => window.clearTimeout(timer);
  }, [investigate]);

  useEffect(() => {
    if (window.location.hash === "#globe-expanded") {
      const frame = window.requestAnimationFrame(() => setIsGlobeExpanded(true));
      return () => window.cancelAnimationFrame(frame);
    }

    if (window.location.hash === "#globe-2d") {
      const frame = window.requestAnimationFrame(() => setGlobeView("2d"));
      return () => window.cancelAnimationFrame(frame);
    }
  }, []);

  return (
    <main className="command-shell relative min-h-screen overflow-hidden bg-[#030508] text-white">
      <ReactBitsAurora />

      <section className="command-stage">
        <header className="command-topbar">
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <div className="grid h-7 w-7 shrink-0 place-items-center rounded-md bg-white text-[9px] font-black text-black">
                Rx
              </div>
              <div className="min-w-0">
                <h1 className="truncate text-xs font-semibold tracking-tight">Drug Shortage Copilot</h1>
              </div>
            </div>
          </div>

          <div className="flex min-w-0 shrink-0 items-center gap-2 text-[11px] text-white/52">
            <span className="status-dot" />
            <span>Graph live</span>
          </div>
        </header>

        <section
          ref={mainGridRef}
          className={isGlobeExpanded ? "command-main-grid globe-expanded-mode" : "command-main-grid"}
          style={mainGridStyle}
        >
          <div className="command-left-column">
            <section className="command-search-panel">
              <form onSubmit={onSubmit} className="command-toolbar">
                <div className="command-search-box">
                  <Search className="pointer-events-none h-4 w-4 shrink-0 text-white/36" />
                  <input
                    aria-label="Investigate a drug shortage"
                    value={query}
                    onChange={(event) => setQuery(event.target.value)}
                    placeholder="Investigate a drug shortage..."
                    className="min-w-0 flex-1 bg-transparent text-sm text-white outline-none placeholder:text-white/32"
                  />
                  <button type="submit" disabled={isInvestigating} className="command-go-button">
                    <span className="submit-label">{isInvestigating ? "Running" : "Go"}</span>
                    <ArrowRight className="h-3.5 w-3.5" />
                  </button>
                </div>
                <details className="legend-tooltip">
                  <summary aria-label="Open map legend">
                    <Info className="h-3.5 w-3.5" />
                  </summary>
                  <div>
                    <span><b>pins</b> plants</span>
                    <span><b>arcs</b> supply flow</span>
                    <span><b>red pulse</b> problem site</span>
                  </div>
                </details>

                <section className="summary-strip">
                <div className="summary-card summary-card-strong">
                  <span className="summary-icon">
                    <Gauge className="h-4 w-4" />
                  </span>
                  <div>
                    <p>Risk</p>
                    <strong>{graph.metrics.riskScore || "--"}</strong>
                    <span>{graph.metrics.riskLevel}</span>
                  </div>
                </div>
                <div className="summary-card">
                  <span className="summary-icon">
                    <Factory className="h-4 w-4" />
                  </span>
                  <div>
                    <p>Supply</p>
                    <strong>{graph.metrics.affectedSupply || "--"}%</strong>
                    <span>{graph.metrics.primaryPlant}</span>
                  </div>
                </div>
                <div className="summary-card">
                  <span className="summary-icon">
                    <ShieldCheck className="h-4 w-4" />
                  </span>
                  <div>
                    <p>Confidence</p>
                    <strong>{Math.round(graph.metrics.confidence * 100) || "--"}%</strong>
                    <span>{graph.metrics.substitutes} substitutes</span>
                  </div>
                </div>
                <div className="summary-card">
                  <span className="summary-icon">
                    <Clock3 className="h-4 w-4" />
                  </span>
                  <div>
                    <p>ETA</p>
                    <strong>{graph.metrics.eta}</strong>
                    <span>Action plan ready</span>
                  </div>
                </div>
              </section>
              </form>
            </section>

          <article className={isGlobeExpanded ? "command-panel globe-panel is-expanded" : "command-panel globe-panel"}>
            <div className="panel-title">
              <span>
                <Activity className="h-4 w-4 text-cyan-200" />
                {globeView === "3d" ? "3D Globe" : "2D Globe"}
              </span>
              <span className="panel-title-actions">
                <span>{activePoint?.name ?? "Waiting for plant signal"}</span>
                <button
                  type="button"
                  className="panel-icon-button"
                  onClick={() => setIsGlobeExpanded((current) => !current)}
                  aria-label={isGlobeExpanded ? "Restore 3D globe panel" : "Expand 3D globe panel"}
                >
                  {isGlobeExpanded ? <Shrink className="h-3.5 w-3.5" /> : <Expand className="h-3.5 w-3.5" />}
                </button>
              </span>
            </div>
            <div ref={setGlobeElement} className="globe-viewport">
              <div className="globe-reflection" aria-hidden="true" />
              <div className="globe-scanline" aria-hidden="true" />
              {points.length === 0 ? (
                <div className="panel-empty-state">Waiting for manufacturing plant signals</div>
              ) : null}
              {globeView === "2d" ? (
                <div className="flat-map-view">
                  <div
                    className="flat-map-image"
                    style={{ backgroundImage: `url(${globeImageUrl})` }}
                    aria-hidden="true"
                  />
                  <div className="flat-map-grid" aria-hidden="true" />
                  <svg className="flat-map-arcs" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">
                    {arcs.map((arc) => (
                      <path key={arc.label} d={flatArcPath(arc)} />
                    ))}
                  </svg>
                  {points.map((point) => {
                    const projected = projectGeoPoint(point.lat, point.lng);
                    const selected = point.id === selectedNodeId;

                    return (
                      <button
                        key={point.id}
                        type="button"
                        className={[
                          "flat-map-pin",
                          point.risk === "high" ? "is-risk" : "",
                          selected ? "is-selected" : "",
                        ].join(" ")}
                        style={{
                          left: `${3 + projected.x * 0.94}%`,
                          top: `${6 + projected.y * 0.88}%`,
                        }}
                        title={point.name}
                        aria-label={`Select ${point.name}`}
                        onClick={() => setSelectedNodeId(point.id)}
                      >
                        <span />
                        <b>{point.name}</b>
                      </button>
                    );
                  })}
                </div>
              ) : globeSize.width > 0 ? (
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
                  pointColor={(point) =>
                    point.id === selectedNodeId ? "#ffffff" : point.risk === "high" ? "#fb7185" : "#67e8f9"
                  }
                  pointAltitude={(point) => (point.id === selectedNodeId ? 0.16 : point.risk === "high" ? 0.12 : 0.06)}
                  pointRadius={(point) => (point.id === selectedNodeId ? 0.52 : point.risk === "high" ? 0.42 : 0.26)}
                  pointResolution={18}
                  pointsTransitionDuration={900}
                  pointLabel={(point) => `${point.name}<br/>${point.description ?? "Manufacturing signal"}`}
                  onPointClick={(point) => setSelectedNodeId(point.id)}
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
                  ringsData={ringPoints}
                  ringLat="lat"
                  ringLng="lng"
                  ringColor={() => (time) => `rgba(251, 113, 133, ${1 - time})`}
                  ringMaxRadius={6}
                  ringPropagationSpeed={1.8}
                  ringRepeatPeriod={900}
                />
              ) : null}
              <div className="globe-view-toggle" aria-label="Switch globe view">
                <button
                  type="button"
                  className={globeView === "2d" ? "is-active" : ""}
                  onClick={() => setGlobeView("2d")}
                >
                  2D view
                </button>
                <button
                  type="button"
                  className={globeView === "3d" ? "is-active" : ""}
                  onClick={() => setGlobeView("3d")}
                >
                  3D view
                </button>
              </div>
            </div>
          </article>
          </div>

          <button
            type="button"
            className="resize-handle resize-handle-vertical"
            onPointerDown={startMainResize}
            aria-label="Resize globe and right panels"
          />

          <div ref={sideGridRef} className="command-side-grid" style={sideGridStyle}>
            <article className="command-panel">
              <div className="panel-title">
                <span>
                  <Network className="h-4 w-4 text-violet-200" />
                  Knowledge Graph Panel
                </span>
                <span>{visibleNodeCount} nodes / {visibleLinkCount} links</span>
              </div>
              <div className="graph-filter-row">
                <Filter className="h-3.5 w-3.5 text-white/42" />
                {graphFilters.map((filter) => (
                  <button
                    key={filter.id}
                    type="button"
                    onClick={() => setGraphFilter(filter.id)}
                    className={filter.id === graphFilter ? "graph-filter is-active" : "graph-filter"}
                  >
                    {filter.label}
                  </button>
                ))}
              </div>
              <div ref={setGraphElement} className="graph-viewport">
                {visibleNodeCount === 0 ? (
                  <div className="panel-empty-state">No nodes match this filter</div>
                ) : null}
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
                    onNodeClick={(node) => setSelectedNodeId(node.id)}
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
                      const selected = node.id === selectedNodeId;

                      if (selected) {
                        ctx.beginPath();
                        ctx.arc(x, y, radius + 6, 0, 2 * Math.PI);
                        ctx.strokeStyle = "rgba(255,255,255,0.82)";
                        ctx.lineWidth = 1.4 / globalScale;
                        ctx.stroke();
                      }

                      ctx.beginPath();
                      ctx.arc(x, y, selected ? radius + 1.8 : radius, 0, 2 * Math.PI);
                      ctx.fillStyle = node.color ?? "#ffffff";
                      ctx.shadowColor = node.color ?? "#ffffff";
                      ctx.shadowBlur = selected ? 24 : node.risk === "high" ? 18 : 8;
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
                {selectedNode ? (
                  <aside className="evidence-drawer">
                    <div className="evidence-drawer-header">
                      <div>
                        <span className="node-type">{selectedNode.type}</span>
                        <h3>{selectedNode.name}</h3>
                      </div>
                      <button
                        type="button"
                        aria-label="Close evidence drawer"
                        onClick={() => setSelectedNodeId(null)}
                      >
                        <X className="h-3.5 w-3.5" />
                      </button>
                    </div>
                    <p>{selectedNode.description ?? selectedNode.impact ?? "No detail available yet."}</p>
                    <div className="evidence-meta">
                      <span>{selectedNode.risk ?? "tracked"} risk</span>
                      <span>{Math.round((selectedNode.confidence ?? graph.metrics.confidence) * 100)}% confidence</span>
                    </div>
                    <ul>
                      {(selectedNode.evidence ?? graph.recommendations).slice(0, 3).map((item) => (
                        <li key={item}>
                          <CheckCircle2 className="h-3.5 w-3.5" />
                          {item}
                        </li>
                      ))}
                    </ul>
                  </aside>
                ) : null}
              </div>
            </article>

            <button
              type="button"
              className="resize-handle resize-handle-horizontal"
              onPointerDown={startRightResize}
              aria-label="Resize knowledge graph and chat panels"
            />

            <article className="command-panel">
              <div className="panel-title">
                <span>
                  <BrainCircuit className="h-4 w-4 text-emerald-200" />
                  Chat / Agent Stream Panel
                </span>
                <span>{isInvestigating ? "streaming" : "idle"}</span>
              </div>
              <div className="agent-stream flex-1 space-y-3 overflow-auto pr-1">
                <div className="root-cause-card">
                  <div className="root-cause-header">
                    <span>
                      <Layers3 className="h-4 w-4" />
                      Root cause brief
                    </span>
                    <strong>{graph.metrics.affectedSupply || "--"}% supply</strong>
                  </div>
                  <p>{graph.summary}</p>
                  <div className="recommendation-row">
                    {graph.recommendations.slice(0, 2).map((recommendation) => (
                      <span key={recommendation}>{recommendation}</span>
                    ))}
                  </div>
                </div>
                {events.map((event) => (
                  <motion.div
                    key={event.id}
                    initial={false}
                    animate={{ opacity: 1, y: 0 }}
                    className={`rounded-md border p-3 ${statusTone(event.status)}`}
                  >
                    <div className="mb-2 flex items-center justify-between gap-3">
                      <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.14em]">
                        <CircleAlert className="h-3.5 w-3.5" />
                        {event.agent}
                      </div>
                      <div className="event-meta">
                        <span>{formatEventTime(event.timestamp)}</span>
                        <span>{event.durationMs ? `${event.durationMs}ms` : event.status}</span>
                      </div>
                    </div>
                    <p className="text-sm leading-6">{event.message}</p>
                    <div className="event-footer">
                      <span>{event.tool}</span>
                      <span>{Math.round((event.confidence ?? 0) * 100) || "--"}% confidence</span>
                      <span>{event.source ?? "Evidence graph"}</span>
                    </div>
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
