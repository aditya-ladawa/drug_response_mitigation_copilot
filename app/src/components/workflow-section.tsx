"use client";

import { motion } from "framer-motion";
import { workflowSteps } from "@/lib/site-content";

export default function WorkflowSection() {
  return (
    <section id="workflow" className="section-shell relative z-10 py-20">
      <div className="grid gap-8 lg:grid-cols-[0.8fr_1.2fr]">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: "-80px" }}
          transition={{ duration: 0.55 }}
          className="panel p-8"
        >
          <p className="eyebrow mb-5">Workflow</p>
          <h2 className="text-4xl font-medium tracking-tight md:text-5xl">
            From source artifact to operator action.
          </h2>
          <p className="body-copy mt-5 max-w-xl">
            This sequence mirrors the repo plan instead of inventing a fake
            marketing funnel. The interface is structured around the real build
            path you outlined.
          </p>
        </motion.div>

        <div className="panel-soft p-6 md:p-8">
          <div className="space-y-5">
            {workflowSteps.map((step, index) => (
              <motion.article
                key={step.number}
                initial={{ opacity: 0, y: 18 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true, margin: "-80px" }}
                transition={{ duration: 0.45, delay: index * 0.05 }}
                className="grid gap-4 border-t border-white/[0.08] pt-5 first:border-t-0 first:pt-0 md:grid-cols-[88px_1fr]"
              >
                <p className="text-xs uppercase tracking-[0.32em] text-white/[0.35]">
                  {step.number}
                </p>
                <div>
                  <h3 className="text-2xl font-medium tracking-tight">{step.title}</h3>
                  <p className="body-copy mt-3">{step.detail}</p>
                </div>
              </motion.article>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}
