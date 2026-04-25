"use client";

import { motion } from "framer-motion";

export default function FluidBackground() {
  return (
    <div className="pointer-events-none fixed inset-0 z-0 overflow-hidden" aria-hidden="true">
      <motion.div
        animate={{ x: [0, 36, -10, 0], y: [0, -24, 18, 0] }}
        transition={{ duration: 18, repeat: Infinity, ease: "easeInOut" }}
        className="hero-orbit absolute left-[-10%] top-[8%] h-[34rem] w-[34rem] rounded-full bg-[radial-gradient(circle,rgba(139,211,199,0.18),transparent_62%)] blur-3xl"
      />
      <motion.div
        animate={{ x: [0, -28, 20, 0], y: [0, 18, -30, 0] }}
        transition={{ duration: 22, repeat: Infinity, ease: "easeInOut" }}
        className="hero-orbit absolute right-[-10%] top-[20%] h-[28rem] w-[28rem] rounded-full bg-[radial-gradient(circle,rgba(200,243,77,0.14),transparent_64%)] blur-3xl"
      />
      <motion.div
        animate={{ x: [0, 12, -24, 0], y: [0, 16, -16, 0] }}
        transition={{ duration: 24, repeat: Infinity, ease: "easeInOut" }}
        className="hero-orbit absolute bottom-[-12%] left-[28%] h-[36rem] w-[36rem] rounded-full bg-[radial-gradient(circle,rgba(86,122,109,0.16),transparent_60%)] blur-3xl"
      />
    </div>
  );
}
