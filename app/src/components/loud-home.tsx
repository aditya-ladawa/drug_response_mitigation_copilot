"use client";

import { AnimatePresence, motion } from "framer-motion";
import Link from "next/link";
import { ChevronUp, Headset } from "lucide-react";
import { useState } from "react";

const industries = [
  "SHORTAGE INTELLIGENCE",
  "SUPPLY RISK",
  "CLINICAL OPERATIONS",
  "PROCUREMENT",
] as const;

const pillars = [
  {
    id: "think",
    roman: "I",
    title: "Investigate",
    label: "Evidence, Signals, Cause",
    body: "Regulatory records, shortage notices, recalls, import alerts, news signals, and product labels resolve into a single cause chain operators can inspect.",
    visual: "radial-gradient(circle at 28% 24%, rgba(255,255,255,.28), transparent 16%), linear-gradient(135deg, rgba(255,255,255,.18), rgba(255,255,255,.035) 42%, rgba(255,255,255,.11))",
    points: ["FDA shortage record", "Warning letter cluster", "ASHP corroboration"],
  },
  {
    id: "design",
    roman: "II",
    title: "Map Exposure",
    label: "Facilities, Products, Dependencies",
    body: "Every shortage is connected to other products, plants, ingredients, and therapeutic alternatives. The interface makes those relationships visible before they become operational surprises.",
    visual: "radial-gradient(circle at 70% 22%, rgba(255,255,255,.24), transparent 14%), linear-gradient(45deg, rgba(255,255,255,.08), rgba(255,255,255,.2) 50%, rgba(255,255,255,.04))",
    points: ["Shared manufacturer", "Adjacent NDCs", "Therapeutic alternatives"],
  },
  {
    id: "develop",
    roman: "III",
    title: "Mitigate",
    label: "Actions, Roles, Time Windows",
    body: "Pharmacy, procurement, and clinical leadership receive different next moves from the same investigation, with urgency and uncertainty kept visible.",
    visual: "radial-gradient(circle at 36% 70%, rgba(255,255,255,.22), transparent 15%), linear-gradient(160deg, rgba(255,255,255,.17), rgba(255,255,255,.04) 52%, rgba(255,255,255,.13))",
    points: ["24-hour pharmacy moves", "7-day sourcing plan", "Clinical substitution review"],
  },
  {
    id: "studio",
    roman: "IV",
    title: "Simulate",
    label: "Scenarios, Shocks, Resilience",
    body: "Teams can test supplier loss, demand spikes, or substitution pressure before a real event escalates, then compare the exposure delta across products and roles.",
    visual: "radial-gradient(circle at 58% 38%, rgba(255,255,255,.26), transparent 13%), linear-gradient(120deg, rgba(255,255,255,.05), rgba(255,255,255,.2) 46%, rgba(255,255,255,.06))",
    points: ["Supplier loss scenario", "Demand spike stress test", "Resilience score"],
  },
] as const;

function IndustriesOverlay({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) {
  return (
    <AnimatePresence>
      {open ? (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-[1000] flex items-center justify-center bg-black/55 px-4 py-20 backdrop-blur-2xl"
        >
          <button
            aria-label="Close industries"
            onClick={onClose}
            className="absolute right-4 top-6 grid h-8 w-8 place-items-center lg:right-10"
          >
            <span className="absolute h-px w-5 rotate-45 bg-white" />
            <span className="absolute h-px w-5 -rotate-45 bg-white" />
          </button>
          <div className="grid w-full max-w-5xl grid-cols-2 gap-2 md:grid-cols-4">
            {industries.map((industry, index) => (
              <motion.a
                key={industry}
                href={`#${pillars[index]?.id ?? "think"}`}
                initial={{ y: 18, opacity: 0 }}
                animate={{ y: 0, opacity: 1 }}
                transition={{ delay: index * 0.06 }}
                onClick={onClose}
                className="flex min-h-28 items-center justify-center border border-white/30 p-4 text-center text-[0.625rem] font-semibold leading-4 tracking-[0.16em] transition-colors duration-200 hover:bg-white hover:text-black md:aspect-square"
              >
                {industry}
              </motion.a>
            ))}
          </div>
        </motion.div>
      ) : null}
    </AnimatePresence>
  );
}

function PillarVisual({ pillar, flipped }: { pillar: (typeof pillars)[number]; flipped: boolean }) {
  return (
    <div className="relative min-h-[360px] overflow-hidden border border-white/20 lg:min-h-[520px]">
      <div className="absolute inset-0" style={{ background: pillar.visual }} />
      <div className="absolute inset-0 bg-black/35" />
      <div className="absolute inset-0 bg-[linear-gradient(rgba(255,255,255,.08)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,.08)_1px,transparent_1px)] bg-[size:80px_80px] opacity-25" />
      <div className="absolute left-[12%] top-[18%] h-28 w-28 rounded-full border border-white/30" />
      <div className="absolute right-[18%] top-[38%] h-40 w-40 rounded-full border border-white/20" />
      <div className="absolute left-[26%] top-[42%] h-px w-[48%] rotate-[-10deg] bg-white/28" />
      <div className="absolute left-[28%] top-[41%] h-3 w-3 rounded-full bg-white" />
      <div className="absolute right-[25%] top-[47%] h-3 w-3 rounded-full border border-white bg-black" />
      <div className="absolute inset-x-0 bottom-0 grid gap-px bg-white/20 md:grid-cols-3">
        {pillar.points.map((point) => (
          <div key={point} className="bg-black/72 p-4 font-mono text-[0.625rem] uppercase tracking-[0.16em] text-white/75 backdrop-blur-sm">
            {point}
          </div>
        ))}
      </div>
      <div
        className={`absolute top-6 h-28 w-28 rounded-full border border-white/55 backdrop-blur-md ${
          flipped ? "left-6" : "right-6"
        }`}
      >
        <div className="flex h-full items-center justify-center font-mono text-xs text-white/80">
          0{pillars.indexOf(pillar) + 1}
        </div>
      </div>
    </div>
  );
}

export default function LoudHome() {
  const [overlayOpen, setOverlayOpen] = useState(false);

  return (
    <main className="relative z-10 bg-black text-white">
      <IndustriesOverlay open={overlayOpen} onClose={() => setOverlayOpen(false)} />

      <section className="loud-hero relative flex min-h-[100dvh] touch-none flex-col justify-between overflow-hidden">
        <div className="pointer-events-none absolute inset-0">
          <motion.div
            animate={{ opacity: [0.22, 0.38, 0.22], scale: [1, 1.05, 1] }}
            transition={{ duration: 8, repeat: Infinity, ease: "easeInOut" }}
            className="absolute left-1/2 top-1/2 h-[62vmin] w-[62vmin] -translate-x-1/2 -translate-y-1/2 rounded-full border border-white/12"
          />
          <div className="absolute inset-x-0 top-1/2 h-px bg-white/10" />
          <div className="absolute bottom-0 left-1/2 h-1/2 w-px bg-white/10" />
        </div>

        <div />

        <div className="relative mx-auto flex w-full max-w-[min(1160px,calc(100vw-48px))] flex-col items-center justify-center gap-5 text-center lg:max-w-[min(1180px,calc(100vw-80px))]">
          <motion.div
            initial={{ y: 18, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            transition={{ duration: 0.55 }}
            className="relative flex h-[30px] items-center justify-center gap-1 rounded-full bg-black/30 px-4 font-mono text-[0.625rem] font-medium tracking-[0.16em] backdrop-blur-sm"
          >
            <span>I</span>
            <span>/</span>
            <span className="opacity-50">VI</span>
            <span>PILLARS</span>
          </motion.div>

          <motion.h1
            initial={{ y: 28 }}
            animate={{ y: 0 }}
            transition={{ duration: 0.7, delay: 0.1 }}
            className="display-title w-full text-balance"
          >
            <span className="block md:inline">Drug</span>{" "}
            <span className="block md:inline">Response.</span>
          </motion.h1>

          <motion.p
            initial={{ y: 16 }}
            animate={{ y: 0 }}
            transition={{ duration: 0.55, delay: 0.2 }}
            className="mx-auto max-w-[340px] px-2 text-balance text-xl leading-[125%] text-white/88 md:max-w-[780px] md:text-[3rem] md:leading-[120%]"
          >
            An evidence-led command surface for shortages, risk propagation, and mitigation.
          </motion.p>
        </div>

        <div className="relative z-[1001] flex items-end justify-between gap-4">
          <div className="flex flex-col items-start gap-5">
            <div className="hidden lg:flex lg:flex-col">
              {industries.map((industry) => (
                <a
                  key={industry}
                  href="#think"
                  className="industry-gradient py-0.5 text-[0.625rem] font-semibold leading-4 tracking-[0.16em]"
                >
                  {industry}
                </a>
              ))}
            </div>
            <button
              type="button"
              className="loud-pill"
              onClick={() => setOverlayOpen(true)}
            >
              Show Industries
              <ChevronUp className="h-4 w-4" />
            </button>
          </div>

          <a href="#think" aria-label="Scroll" className="hidden h-[50px] w-[50px] rounded-full border border-white/80 backdrop-blur-sm md:block">
            <span className="flex h-full items-center justify-center font-mono text-xs">01</span>
          </a>

          <Link href="/studio" className="loud-pill w-[34px] px-0 lg:w-auto lg:px-4">
            <span className="hidden lg:block">Are you the next?</span>
            <Headset className="h-4 w-4 lg:hidden" />
          </Link>
        </div>
      </section>

      <section id="think" className="relative border-t border-white/14">
        <div className="section-shell py-20 lg:py-28">
          <div className="grid gap-8 lg:grid-cols-[300px_1fr]">
            <div className="sticky top-28 hidden h-max lg:block">
              <p className="eyebrow">I / VI PILLARS</p>
              <p className="mt-6 max-w-[230px] text-sm leading-7 text-white/55">
                Built like the reference: restrained black surface, mono controls, huge editorial rhythm, and product details revealed in stages.
              </p>
            </div>

            <div className="space-y-24">
              {pillars.map((pillar, index) => {
                const flipped = index % 2 === 1;

                return (
                  <motion.article
                    id={pillar.id}
                    key={pillar.title}
                    initial={{ opacity: 0, y: 32 }}
                    whileInView={{ opacity: 1, y: 0 }}
                    viewport={{ once: true, margin: "-120px" }}
                    transition={{ duration: 0.6 }}
                    className="grid min-h-[70vh] gap-8 lg:grid-cols-2 lg:gap-20"
                  >
                    <div className={`flex ${flipped ? "lg:order-2 lg:justify-start" : "lg:justify-end"} items-end`}>
                      <div className="max-w-[560px]">
                        <p className="eyebrow mb-8">{pillar.roman} / {pillar.label}</p>
                        <h2 className="mono-title text-5xl leading-tight md:text-6xl">
                          {pillar.title}
                        </h2>
                        <p className="mt-10 max-w-sm font-mono text-sm leading-7 tracking-[0.1em] text-white/75">
                          {pillar.label}
                        </p>
                        <p className="mt-8 max-w-md pl-0 text-sm leading-7 text-white/72 md:pl-3">
                          {pillar.body}
                        </p>
                      </div>
                    </div>
                    <div className={flipped ? "lg:order-1" : ""}>
                      <PillarVisual pillar={pillar} flipped={flipped} />
                    </div>
                  </motion.article>
                );
              })}
            </div>
          </div>
        </div>
      </section>

      <section className="bg-white text-black">
        <div className="section-shell py-16 lg:py-24">
          <div className="grid gap-8 lg:grid-cols-[1fr_1.2fr] lg:items-end">
            <p className="max-w-xl text-4xl leading-[1.08] md:text-6xl">
              We think, design and develop resilient shortage workflows for teams that cannot wait.
            </p>
            <div className="grid gap-px bg-black/20 md:grid-cols-3">
              {["13 public sources", "6 agent roles", "1 command surface"].map((item) => (
                <div key={item} className="bg-white p-6">
                  <p className="font-mono text-[0.625rem] uppercase tracking-[0.16em] text-black/45">
                    Signal
                  </p>
                  <p className="mt-10 text-2xl">{item}</p>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>
    </main>
  );
}
