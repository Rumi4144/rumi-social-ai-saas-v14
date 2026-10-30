type Customer = { id: string; name: string };

export default function AdminCustomerFilter({ action, organizations, organization, search = "", completed = false }: {
  action: string; organizations: Customer[]; organization: Customer | null; search?: string; completed?: boolean;
}) {
  const choices = organization && !organizations.some(row => row.id === organization.id) ? [organization, ...organizations] : organizations;
  return <section className="card" style={{ marginBottom: 24 }}>
    <form action={action} method="get" style={{ display: "flex", alignItems: "end", gap: 12, flexWrap: "wrap" }}>
      <label>Find a customer<input name="q" defaultValue={search} placeholder="Business name" maxLength={100} /></label>
      <button type="submit">Find</button>
    </form>
    <form action={action} method="get" style={{ display: "flex", alignItems: "end", gap: 12, flexWrap: "wrap", marginTop: 16 }}>
      <input type="hidden" name="q" value={search} />
      {completed && <input type="hidden" name="completed" value="1" />}
      <label>Customer<select name="organizationId" defaultValue={organization?.id || ""} required>
        <option value="" disabled>Choose a customer</option>
        {choices.map(row => <option key={row.id} value={row.id}>{row.name}</option>)}
      </select></label>
      <button type="submit">View customer</button>
    </form>
    {organizations.length === 100 && <p>Showing the first 100 matches. Search by business name to narrow the list.</p>}
  </section>;
}
