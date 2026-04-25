"use client";

import { motion } from "framer-motion";
import { ArrowRight } from "lucide-react";
import { useState } from "react";
import { caseStudies } from "@/lib/site-content";

export default function InvestigateSection() {
  const [activeCaseId, setActiveCaseId] = useState<string>(caseStudies[0].id);
  const activeCase = caseStudies.find((item) => item.id === activeCaseId) ?? caseStudies[0];

  return (
    <section id="investigate" className="section-shell relative z-10 py-20">
      <div className="grid gap-8 lg:grid-cols-[0.82fr_1.18fr]">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: "-80px" }}
          transition={{ duration: 0.6 }}
          className="panel p-8"
        >
          <p className="eyebrow mb-5">Live Case Surface</p>
          <h2 className="text-4xl font-medium tracking-tight md:text-5xl">
            A front-end that already feels like the real investigation workflow.
          </h2>
          <p className="body-copy mt-5 max-w-xl">
            I kept this section interactive so the template already demonstrates
            how the future product can pivot between shortage cases without
            losing its editorial feel.
          </p>

          <div className="mt-8 flex flex-wrap gap-3">
            {caseStudies.map((item) => {
              const active = item.id === activeCaseId;

              return (
                <button
                  key={item.id}
                  onClick={() => setActiveCaseId(item.id)}
                  className={`rounded-full border px-4 py-2 text-sm transition-colors ${
                    active
                      ? "border-[var(--color-accent)]/40 bg-[var(--color-accent)]/10 text-[var(--color-foreground)]"
                      : "border-white/[0.10] bg-white/[0.04] text-white/[0.52] hover:border-white/[0.24] hover:text-white/[0.84]"
                  }`}
                >
                  {item.label}
                </button>
              );
            })}
          </div>

          <div className="mt-8 rounded-[24px] border border-white/[0.08] bg-white/[0.04] p-6">
            <p className="eyebrow mb-3">Selected Query</p>
            <div className="flex items-center justify-between gap-4">
              <div>
                <p className="text-2xl font-medium tracking-tight">{activeCase.label}</p>
                <p className="body-copy mt-3 max-w-lg">{activeCase.summary}</p>
              </div>
              <span className="hidden rounded-full border border-white/[0.10] px-3 py-1 text-[10px] uppercase tracking-[0.28em] text-white/[0.48] md:inline-flex">
                Simulated Output
              </span>
            </div>
          </div>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: "-80px" }}
          transition={{ duration: 0.6, delay: 0.08 }}
          className="panel p-6 md:p-8"
        >
          <div className="grid gap-6 xl:grid-cols-[1.05fr_0.95fr]">
            <div>
              <div className="mb-5 flex items-center justify-between">
                <p className="eyebrow">Ranked Causes</p>
                <span className="text-xs uppercase tracking-[0.28em] text-white/[0.36]">
                  Case File
                </span>
              </div>
              <div className="space-y-3">
                {activeCase.causes.map((cause, index) => (
                  <div
                    key={cause.title}
                    className="rounded-[22px] border border-white/[0.08] bg-white/[0.04] p-5"
                  >
                    <div className="flex items-start justify-between gap-4">
                      <p className="text-lg font-medium leading-snug text-[var(--color-foreground)]">
                        {cause.title}
                      </p>
                      <span className="rounded-full border border-white/[0.10] px-3 py-1 text-[10px] uppercase tracking-[0.24em] text-white/[0.46]">
                        0{index + 1}
                      </span>
                    </div>
                    <p className="mt-3 text-xs uppercase tracking-[0.28em] text-[var(--color-accent)]">
                      {cause.confidence}
                    </p>
                    <p className="body-copy mt-3">{cause.evidence}</p>
                  </div>
                ))}
              </div>
            </div>

            <div className="space-y-6">
              <div className="rounded-[22px] border border-white/[0.08] bg-white/[0.04] p-5">
                <div className="mb-4 flex items-center justify-between">
                  <p className="eyebrow">Timeline</p>
                  <ArrowRight className="h-3.5 w-3.5 text-white/[0.34]" />
                </div>
                <div className="space-y-4">
                  {activeCase.timeline.map((event, index) => (
                    <div key={event} className="grid grid-cols-[18px_1fr] gap-4">
                      <div className="flex flex-col items-center">
                        <div className="mt-1 h-2.5 w-2.5 rounded-full bg-[var(--color-accent-strong)]" />
                        {index < activeCase.timeline.length - 1 ? (
                          <div className="mt-2 h-full w-px bg-white/[0.10]" />
                        ) : null}
                      </div>
                      <p className="pb-4 text-sm leading-relaxed text-white/[0.68]">{event}</p>
                    </div>
                  ))}
                </div>
              </div>

              <div className="rounded-[22px] border border-white/[0.08] bg-white/[0.04] p-5">
                <p className="eyebrow mb-4">At-Risk Adjacency</p>
                <div className="flex flex-wrap gap-3">
                  {activeCase.exposures.map((item) => (
                    <span
                      key={item}
                      className="rounded-full border border-white/[0.10] px-4 py-2 text-sm text-white/[0.72]"
                    >
                      {item}
                    </span>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </motion.div>
      </div>
    </section>
  );
}
