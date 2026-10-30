type Delivery = { id: string; platform: string; accountName: string; status: string; publishedAt: Date | null; link: string | null; externalPostId: string | null; lastError: string | null };

export default function AdminDeliveryList({ deliveries }: { deliveries: Delivery[] }) {
  return <ul>{deliveries.map(delivery => <li key={delivery.id} style={{ marginBottom: 12, overflowWrap: "anywhere" }}>
    <strong>{delivery.platform} · {delivery.accountName}</strong> — {delivery.status.replaceAll("_", " ")}
    {delivery.publishedAt && <> · {delivery.publishedAt.toLocaleString("en-US", { timeZone: "UTC" })} UTC</>}
    {delivery.link && <> · <a href={delivery.link} target="_blank" rel="noreferrer">View posted item ↗</a></>}
    {!delivery.link && delivery.externalPostId && <div>Platform reference: {delivery.externalPostId}</div>}
    {delivery.lastError && <div>Delivery note: {delivery.lastError}</div>}
  </li>)}</ul>;
}
