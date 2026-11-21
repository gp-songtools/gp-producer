export default function Placeholder({ title, note }: { title: string; note: string }) {
  return (
    <section>
      <h1 className="text-xl font-semibold">{title}</h1>
      <p className="mt-2 text-neutral-400">{note}</p>
    </section>
  );
}
