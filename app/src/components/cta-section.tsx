"use client";

import { motion } from "framer-motion";
import Link from "next/link";
import { ArrowRight } from "lucide-react";

export default function CTASection() {
  return (
    <section id="contact" className="section-shell relative z-10 py-20">
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        whileInView={{ opacity: 1, y: 0 }}
        viewport={{ once: true, margin: "-80px" }}
        transition={{ duration: 0.6 }}
        className="panel flex flex-col gap-8 p-8 lg:flex-row lg:items-end lg:justify-between"
      >
        <div className="max-w-3xl">
          <p className="eyebrow mb-5">Next Pass</p>
          <h2 className="text-4xl font-medium tracking-tight md:text-6xl">
            The clone template is in place. The next step is your product-specific narrative.
          </h2>
          <p className="body-copy mt-5 max-w-2xl">
            The shell now has the reference site&apos;s premium minimal rhythm, but it
            is grounded in your shortage-command-center concept instead of agency
            filler. From here we can turn it into the exact version you want.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-4">
          <Link href="/manifesto" className="button-primary">
            Review Direction
            <ArrowRight className="h-3.5 w-3.5" />
          </Link>
          <Link href="/studio" className="button-secondary">
            Open Studio Page
          </Link>
        </div>
      </motion.div>
    </section>
  );
}
