"use client";

import { motion } from "framer-motion";
import { pillars } from "@/lib/site-content";

export default function PillarsSection() {
  return (
    <section id="surfaces" className="section-shell relative z-10 py-20">
      <div className="mb-10 max-w-3xl">
        <p className="eyebrow mb-5">Core Surfaces</p>
        <h2 className="text-4xl font-medium tracking-tight md:text-6xl">
          The homepage now mirrors the structure of a premium studio site, but
          every surface points back to your command-center thesis.
        </h2>
      </div>

      <div className="space-y-8">
        {pillars.map((pillar, index) => (
          <motion.article
            key={pillar.title}
            initial={{ opacity: 0, y: 24 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, margin: "-80px" }}
            transition={{ duration: 0.55, delay: index * 0.04 }}
            className="grid gap-6 lg:grid-cols-2"
          >
            <div className={`panel p-8 md:p-10 ${index % 2 === 1 ? "lg:order-2" : ""}`}>
              <p className="eyebrow mb-5">
                {pillar.index} / {pillar.eyebrow}
              </p>
              <h3 className="text-4xl font-medium tracking-tight md:text-5xl">
                {pillar.title}
              </h3>
              <p className="body-copy mt-5 max-w-xl">{pillar.description}</p>
              <div className="mt-8 space-y-4">
                {pillar.bullets.map((item) => (
                  <div
                    key={item}
                    className="border-t border-white/[0.08] pt-4 first:border-t-0 first:pt-0"
                  >
                    <p className="text-base leading-relaxed text-white/[0.74]">{item}</p>
                  </div>
                ))}
              </div>
            </div>

            <div className={`panel-soft p-5 md:p-6 ${index % 2 === 1 ? "lg:order-1" : ""}`}>
              <div className="relative overflow-hidden rounded-[24px] border border-white/[0.08] bg-[linear-gradient(180deg,rgba(255,255,255,0.05),rgba(255,255,255,0.02))] p-6">
                <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_left,rgba(139,211,199,0.14),transparent_38%),radial-gradient(circle_at_bottom_right,rgba(200,243,77,0.12),transparent_32%)]" />
                <div className="relative">
                  <div className="mb-8 flex items-center justify-between">
                    <p className="eyebrow">{pillar.visualLabel}</p>
                    <span className="rounded-full border border-white/[0.10] px-3 py-1 text-[10px] uppercase tracking-[0.28em] text-white/[0.42]">
                      Surface Mock
                    </span>
                  </div>
                  <div className="grid gap-4 md:grid-cols-3">
                    {pillar.visualStats.map((item) => (
                      <div
                        key={item}
                        className="rounded-[20px] border border-white/[0.08] bg-[#0d1312]/70 p-4"
                      >
                        <p className="text-sm leading-relaxed text-white/[0.72]">{item}</p>
                      </div>
                    ))}
                  </div>
                  <div className="mt-6 rounded-[24px] border border-white/[0.08] bg-[#0d1312]/68 p-5">
                    <div className="grid gap-3 md:grid-cols-2">
                      <div className="rounded-[18px] border border-white/[0.07] bg-white/[0.04] p-4">
                        <p className="eyebrow mb-3">Signal Layer</p>
                        <div className="space-y-2">
                          <div className="h-2 rounded-full bg-white/[0.10]" />
                          <div className="h-2 w-5/6 rounded-full bg-[var(--color-accent)]/35" />
                          <div className="h-2 w-3/4 rounded-full bg-white/[0.10]" />
                        </div>
                      </div>
                      <div className="rounded-[18px] border border-white/[0.07] bg-white/[0.04] p-4">
                        <p className="eyebrow mb-3">Operator Layer</p>
                        <div className="space-y-3">
                          <div className="rounded-full border border-white/[0.08] px-3 py-2 text-sm text-white/[0.68]">
                            Pharmacy
                          </div>
                          <div className="rounded-full border border-white/[0.08] px-3 py-2 text-sm text-white/[0.68]">
                            Procurement
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </motion.article>
        ))}
      </div>
    </section>
  );
}
