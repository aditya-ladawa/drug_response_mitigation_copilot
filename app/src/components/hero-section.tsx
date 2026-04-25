"use client";

import { AnimatePresence, motion } from "framer-motion";
import Link from "next/link";
import { ArrowRight, ChevronDown, ChevronUp } from "lucide-react";
import { useEffect, useState } from "react";
import { surfaceCards } from "@/lib/site-content";

const rotatingWords = ["Investigate", "Anticipate", "Mitigate"] as const;

export default function HeroSection() {
  const [showSurfaces, setShowSurfaces] = useState(false);
  const [wordIndex, setWordIndex] = useState(0);

  useEffect(() => {
    const interval = window.setInterval(() => {
      setWordIndex((current) => (current + 1) % rotatingWords.length);
    }, 2200);

    return () => window.clearInterval(interval);
  }, []);

  return (
    <section id="top" className="relative flex min-h-screen items-center overflow-hidden pt-24">
      <div className="section-shell grid gap-10 lg:grid-cols-[1.05fr_0.95fr] lg:items-end">
        <div className="max-w-4xl py-14">
          <motion.p
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5 }}
            className="eyebrow mb-6"
          >
            Premium Frontend Template / Drug Shortage Response & Mitigation Copilot
          </motion.p>

          <motion.div
            initial={{ opacity: 0, y: 24 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.7, delay: 0.08 }}
            className="mb-6 flex h-10 items-center overflow-hidden text-sm uppercase tracking-[0.35em] text-[var(--color-accent)]"
          >
            <AnimatePresence mode="wait">
              <motion.span
                key={rotatingWords[wordIndex]}
                initial={{ y: 22, opacity: 0 }}
                animate={{ y: 0, opacity: 1 }}
                exit={{ y: -22, opacity: 0 }}
                transition={{ duration: 0.28 }}
                className="font-mono"
              >
                {rotatingWords[wordIndex]}
              </motion.span>
            </AnimatePresence>
          </motion.div>

          <motion.h1
            initial={{ opacity: 0, y: 26 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.8, delay: 0.12 }}
            className="display-title"
          >
            Drug shortage intelligence for teams who cannot wait.
          </motion.h1>

          <motion.p
            initial={{ opacity: 0, y: 18 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.7, delay: 0.22 }}
            className="body-copy mt-8 max-w-2xl"
          >
            A LOUD-inspired frontend shell, translated into your product thesis:
            investigate the shortage, understand the cause chain, expose what is
            at risk next, and make mitigation decisions from one premium surface.
          </motion.p>

          <motion.div
            initial={{ opacity: 0, y: 18 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.7, delay: 0.3 }}
            className="mt-10 flex flex-wrap items-center gap-4"
          >
            <Link href="/#investigate" className="button-primary">
              Open Case Surface
              <ArrowRight className="h-3.5 w-3.5" />
            </Link>
            <Link href="/manifesto" className="button-secondary">
              Read Manifesto
            </Link>
          </motion.div>

          <motion.div
            initial={{ opacity: 0, y: 18 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.7, delay: 0.36 }}
            className="mt-12 flex flex-wrap items-center gap-4"
          >
            <button
              onClick={() => setShowSurfaces((current) => !current)}
              className="button-secondary"
            >
              {showSurfaces ? "Hide Surfaces" : "Show Surfaces"}
              {showSurfaces ? (
                <ChevronDown className="h-3.5 w-3.5" />
              ) : (
                <ChevronUp className="h-3.5 w-3.5" />
              )}
            </button>
            <p className="text-sm text-white/[0.46]">
              13 public data sources already validated in the repository.
            </p>
          </motion.div>
        </div>

        <motion.div
          initial={{ opacity: 0, y: 26 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.8, delay: 0.16 }}
          className="panel hidden p-6 lg:block"
        >
          <div className="flex items-center justify-between border-b border-white/[0.08] pb-4">
            <p className="eyebrow">Live Product Framing</p>
            <span className="rounded-full border border-[var(--color-accent)]/30 bg-[var(--color-accent)]/8 px-3 py-1 text-[10px] uppercase tracking-[0.28em] text-[var(--color-accent)]">
              Template Ready
            </span>
          </div>
          <div className="mt-6 grid gap-4">
            <div className="rounded-[22px] border border-white/[0.08] bg-white/[0.04] p-5">
              <p className="eyebrow mb-3">Case File</p>
              <p className="text-2xl tracking-tight">Amoxicillin suspension</p>
              <p className="body-copy mt-3">
                Ranked signals indicate manufacturing quality pressure plus a
                substitution-driven demand spike.
              </p>
            </div>
            <div className="grid gap-4 md:grid-cols-2">
              <div className="rounded-[22px] border border-white/[0.08] bg-white/[0.04] p-5">
                <p className="eyebrow mb-3">Evidence</p>
                <ul className="space-y-3 text-sm text-white/[0.68]">
                  <li>Warning letter cluster</li>
                  <li>Import alert relationship</li>
                  <li>ASHP corroboration</li>
                </ul>
              </div>
              <div className="rounded-[22px] border border-white/[0.08] bg-white/[0.04] p-5">
                <p className="eyebrow mb-3">Action Lane</p>
                <ul className="space-y-3 text-sm text-white/[0.68]">
                  <li>Pharmacy conservation protocol</li>
                  <li>Procurement diversification trigger</li>
                  <li>Clinical substitution review</li>
                </ul>
              </div>
            </div>
          </div>
        </motion.div>
      </div>

      <AnimatePresence>
        {showSurfaces && (
          <motion.div
            initial={{ opacity: 0, y: 24 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 24 }}
            transition={{ duration: 0.35 }}
            className="section-shell mt-8 pb-10"
          >
            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
              {surfaceCards.map((card, index) => (
                <motion.div
                  key={card.title}
                  initial={{ opacity: 0, y: 18 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: index * 0.06 }}
                  className="panel-soft flex min-h-56 flex-col justify-between p-6"
                >
                  <div>
                    <p className="eyebrow mb-4">{card.index}</p>
                    <h2 className="text-2xl font-medium tracking-tight">{card.title}</h2>
                  </div>
                  <p className="body-copy mt-6">{card.blurb}</p>
                </motion.div>
              ))}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </section>
  );
}
