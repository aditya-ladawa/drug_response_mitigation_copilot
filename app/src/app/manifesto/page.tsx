import Link from "next/link";

const principles = [
  "Evidence before opinion",
  "Relationships over isolated alerts",
  "Role-specific actions",
  "Visible uncertainty",
  "Simulation in the core flow",
  "Calm under pressure",
] as const;

export default function ManifestoPage() {
  return (
    <main className="relative z-10 bg-black pt-28 text-white">
      <section className="section-shell min-h-[70vh] py-16">
        <p className="eyebrow">Manifesto</p>
        <h1 className="mt-10 max-w-6xl text-6xl leading-[0.95] md:text-8xl">
          Build the shortage interface like a command room.
        </h1>
        <p className="mt-10 max-w-2xl text-lg leading-8 text-white/68">
          This product should not feel like a generic tracker. It should help operators
          understand why a shortage is happening, what else is exposed, and what to do next.
        </p>
      </section>

      <section className="border-y border-white/18">
        <div className="section-shell grid gap-px bg-white/18 md:grid-cols-2 lg:grid-cols-3">
          {principles.map((principle, index) => (
            <article key={principle} className="min-h-56 bg-black p-6 md:p-10">
              <p className="eyebrow">0{index + 1}</p>
              <h2 className="mt-16 text-3xl leading-tight">{principle}</h2>
            </article>
          ))}
        </div>
      </section>

      <section className="section-shell py-16 lg:py-24">
        <div className="grid gap-10 lg:grid-cols-[1fr_0.8fr] lg:items-end">
          <h2 className="max-w-4xl text-5xl leading-[1.02] md:text-7xl">
            The best interface reduces panic by making the evidence legible.
          </h2>
          <Link href="/" className="loud-pill w-max">
            Back to Home
          </Link>
        </div>
      </section>
    </main>
  );
}
