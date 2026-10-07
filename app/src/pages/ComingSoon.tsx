export function ComingSoon({ title, phase, children }: { title: string; phase: number; children: string }) {
  return (
    <section className="card">
      <h1>{title}</h1>
      <p>{children}</p>
      <p className="label">Arrives in phase {phase}</p>
    </section>
  );
}
