import Link from "next/link";

const steps = [
  "Resolve drugs, labelers, applicants, plants, and events",
  "Rank likely shortage causes with inspectable evidence",
  "Map adjacent products and therapeutic exposure",
  "Generate role-based mitigation moves",
  "Stress test supplier loss and demand spikes",
  "Export a calm operator-ready decision brief",
] as const;

export default function StudioPage() {
  return (
    <main className="relative z-10 bg-black pt-28 text-white">
      <section className="section-shell min-h-[72vh] py-16">
        <p className="eyebrow">Studio</p>
        <h1 className="mt-10 max-w-6xl text-6xl leading-[0.95] md:text-8xl">
          A product studio surface for shortage mitigation.
        </h1>
        <p className="mt-10 max-w-2xl text-lg leading-8 text-white/68">
          The experience is structured around investigation, exposure, mitigation,
          and scenario testing instead of disconnected dashboard widgets.
        </p>
      </section>

      <section className="border-y border-white/18">
        <div className="section-shell grid gap-px bg-white/18">
          {steps.map((step, index) => (
            <div key={step} className="grid gap-8 bg-black p-6 md:grid-cols-[120px_1fr] md:p-10">
              <p className="font-mono text-sm text-white/45">0{index + 1}</p>
              <p className="max-w-4xl text-3xl leading-tight md:text-5xl">{step}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="section-shell py-16 lg:py-24">
        <div className="grid gap-10 lg:grid-cols-[1fr_0.8fr] lg:items-end">
          <h2 className="max-w-4xl text-5xl leading-[1.02] md:text-7xl">
            Designed to feel deliberate, fast, and operationally serious.
          </h2>
          <Link href="/" className="loud-pill w-max">
            Back to Home
          </Link>
        </div>
      </section>
    </main>
  );
}
