"use client";

import { motion } from "framer-motion";
import { agentStack } from "@/lib/site-content";

export default function AgentsSection() {
  return (
    <section id="agents" className="section-shell relative z-10 py-20">
      <div className="grid gap-8 lg:grid-cols-[0.86fr_1.14fr]">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: "-80px" }}
          transition={{ duration: 0.55 }}
          className="panel p-8"
        >
          <p className="eyebrow mb-5">Agent Stack</p>
          <h2 className="text-4xl font-medium tracking-tight md:text-5xl">
            The frontend now has a believable AI product shape behind the design.
          </h2>
          <p className="body-copy mt-5 max-w-xl">
            The cards below translate the roles from your `plan.md` into a clean,
            premium grid so the site already reads like the real platform you are
            building.
          </p>
        </motion.div>

        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {agentStack.map((agent, index) => (
            <motion.article
              key={agent.name}
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, margin: "-80px" }}
              transition={{ duration: 0.48, delay: index * 0.05 }}
              className="panel-soft min-h-60 p-6"
            >
              <p className="eyebrow mb-4">Role 0{index + 1}</p>
              <h3 className="text-2xl font-medium tracking-tight">{agent.name}</h3>
              <p className="body-copy mt-4">{agent.role}</p>
            </motion.article>
          ))}
        </div>
      </div>
    </section>
  );
}
