"use client";

import { motion } from "framer-motion";
import { signalGroups } from "@/lib/site-content";

export default function DataSourcesSection() {
  return (
    <section id="sources" className="section-shell relative z-10 py-20">
      <div className="grid gap-8 lg:grid-cols-[0.88fr_1.12fr]">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: "-80px" }}
          transition={{ duration: 0.55 }}
          className="panel p-8"
        >
          <p className="eyebrow mb-5">Signal Architecture</p>
          <h2 className="text-4xl font-medium tracking-tight md:text-5xl">
            The design stays premium because the information architecture is
            disciplined underneath it.
          </h2>
          <p className="body-copy mt-5 max-w-xl">
            I tied the front-end narrative directly to the sources and entity
            layers already described in your markdown docs. That keeps the visual
            clone aligned with the real system we plan to ship.
          </p>

          <div className="mt-8 rounded-[24px] border border-white/[0.08] bg-white/[0.04] p-6">
            <p className="eyebrow mb-4">Why This Matters</p>
            <p className="body-copy">
              The page is not presenting random feature cards. It is presenting
              the flow from regulatory evidence to graph relationships to operator
              action, which is exactly the core idea in your project docs.
            </p>
          </div>
        </motion.div>

        <div className="grid gap-4 md:grid-cols-2">
          {signalGroups.map((group, index) => (
            <motion.article
              key={group.title}
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, margin: "-80px" }}
              transition={{ duration: 0.5, delay: index * 0.06 }}
              className="panel-soft p-6"
            >
              <p className="eyebrow mb-4">Layer 0{index + 1}</p>
              <h3 className="text-2xl font-medium tracking-tight">{group.title}</h3>
              <p className="body-copy mt-4">{group.description}</p>
              <div className="mt-6 flex flex-wrap gap-3">
                {group.sources.map((source) => (
                  <span
                    key={source}
                    className="rounded-full border border-white/[0.10] px-4 py-2 text-sm text-white/[0.68]"
                  >
                    {source}
                  </span>
                ))}
              </div>
            </motion.article>
          ))}
        </div>
      </div>
    </section>
  );
}
