import Link from "next/link";

const groups = [
  {
    title: "LOUD",
    links: [
      { label: "Think", href: "/#think" },
      { label: "Design", href: "/#design" },
      { label: "Develop", href: "/#develop" },
      { label: "Manifesto", href: "/manifesto" },
      { label: "Studio", href: "/studio" },
    ],
  },
  {
    title: "CONTACT",
    links: [
      { label: "Procurement Teams", href: "/studio" },
      { label: "Clinical Leaders", href: "/studio" },
      { label: "Pharmacy Ops", href: "/studio" },
    ],
  },
] as const;

export default function Footer() {
  return (
    <footer className="relative z-10 border-t border-white/20 bg-black text-white">
      <div className="section-shell py-10 lg:py-16">
        <div className="grid gap-10 lg:grid-cols-[1.35fr_0.65fr_0.65fr]">
          <div>
            <h2 className="max-w-3xl text-5xl leading-[1.02] md:text-7xl">
              Let&apos;s build something resilient...
            </h2>
            <Link href="/studio" className="loud-pill mt-8">
              Work together
            </Link>
          </div>

          {groups.map((group) => (
            <div key={group.title}>
              <p className="eyebrow mb-5">{group.title}</p>
              <ul className="space-y-2">
                {group.links.map((link) => (
                  <li key={link.label}>
                    <Link
                      href={link.href}
                      className="text-sm text-white/62 transition-opacity duration-200 hover:opacity-60"
                    >
                      {link.label}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>

        <div className="mt-14 flex flex-col gap-3 border-t border-white/16 pt-6 font-mono text-[0.625rem] uppercase tracking-[0.16em] text-white/45 md:flex-row md:items-center md:justify-between">
          <p>2026 © PharmaSight</p>
          <p>Drug Response & Mitigation Copilot</p>
        </div>
      </div>
    </footer>
  );
}
