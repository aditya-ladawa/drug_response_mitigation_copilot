"use client";

import { AnimatePresence, motion } from "framer-motion";
import Link from "next/link";
import { useState } from "react";
import { Menu, X } from "lucide-react";

const navItems = [
  { label: "Think.", href: "/#think" },
  { label: "Design.", href: "/#design" },
  { label: "Develop.", href: "/#develop" },
  { label: "Manifesto", href: "/manifesto" },
  { label: "Studio", href: "/studio" },
] as const;

export default function Navbar() {
  const [open, setOpen] = useState(false);

  return (
    <header className="site-header fixed left-0 top-0 z-[1003] w-full">
      <div className="flex items-center justify-between">
        <Link href="/" className="flex items-center gap-2 text-xs tracking-[0.08em]">
          <span className="grid h-[25px] w-[25px] place-items-center rounded-sm border border-white bg-white text-[10px] font-black text-black">
            Rx
          </span>
          <span className="flex flex-wrap gap-x-2">
            <span className="font-black text-white">PharmaSight.</span>
            <span className="text-white/60">Drug Response Company.</span>
          </span>
        </Link>

        <nav className="hidden lg:flex">
          <ul className="flex items-center gap-10">
            {navItems.map((item) => (
              <li key={item.label}>
                <Link
                  href={item.href}
                  className="block py-8 text-sm font-medium text-white transition-opacity duration-300 hover:opacity-60"
                >
                  {item.label}
                </Link>
              </li>
            ))}
          </ul>
        </nav>

        <button
          className="grid h-7 w-7 place-items-center lg:hidden"
          aria-label="Toggle menu"
          aria-expanded={open}
          onClick={() => setOpen((value) => !value)}
        >
          {open ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
        </button>
      </div>

      <AnimatePresence>
        {open ? (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 -z-10 bg-black/88 backdrop-blur-2xl lg:hidden"
          >
            <nav className="flex h-full items-center justify-center">
              <ul className="text-center">
                {navItems.map((item, index) => (
                  <motion.li
                    key={item.label}
                    initial={{ y: 18, opacity: 0 }}
                    animate={{ y: 0, opacity: 1 }}
                    transition={{ delay: index * 0.05 }}
                    className="my-4"
                  >
                    <Link
                      href={item.href}
                      onClick={() => setOpen(false)}
                      className="text-4xl font-light text-white"
                    >
                      {item.label}
                    </Link>
                  </motion.li>
                ))}
              </ul>
            </nav>
          </motion.div>
        ) : null}
      </AnimatePresence>
    </header>
  );
}
