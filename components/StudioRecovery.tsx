export default function StudioRecovery({ recovery }: { recovery: { title: string; description: string; href: string; action: string } }) {
  return <section className="card"><div className="eyebrow">CREATIVE STUDIO</div><h1>{recovery.title}</h1><p>{recovery.description}</p><a className="button" href={recovery.href}>{recovery.action}</a></section>;
}
