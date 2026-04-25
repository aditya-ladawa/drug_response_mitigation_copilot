"use client";

import { motion } from "framer-motion";
import { homeMetrics } from "@/lib/site-content";

export default function StatsBar() {
  return (
    <section className="section-shell relative z-10 py-14">
      <div className="panel-soft grid gap-4 p-5 md:grid-cols-2 xl:grid-cols-4 xl:p-6">
        {homeMetrics.map((metric, index) => (
          <motion.div
            key={metric.label}
            initial={{ opacity: 0, y: 18 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, margin: "-60px" }}
            transition={{ duration: 0.45, delay: index * 0.06 }}
            className="rounded-[22px] border border-white/[0.07] bg-white/[0.04] p-5"
          >
            <div className="flex items-end justify-between gap-3">
              <p className="text-5xl font-medium tracking-[-0.06em] text-[var(--color-foreground)]">
                {metric.value}
              </p>
              <p className="eyebrow">{metric.label}</p>
            </div>
            <p className="mt-4 text-sm leading-relaxed text-white/[0.54]">{metric.detail}</p>
          </motion.div>
        ))}
      </div>
    </section>
  );
}
