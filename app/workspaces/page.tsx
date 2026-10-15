import { studioPageContext } from "@/lib/studio/page-context";
import StudioRecovery from "@/components/StudioRecovery";
import OpenWorkspace from "@/components/OpenWorkspace";
export default async function Workspaces() {
  const { context: ctx, recovery } = await studioPageContext();
  if (recovery) return <StudioRecovery recovery={recovery} />;
  return <><div className="eyebrow">WORKSPACES</div><h1>Choose a brand workspace.</h1><p>Current workspace: {ctx.organization.name}.</p><div className="workspacegrid">{ctx.memberships.map(m => <article className="card" key={m.id}><span className="eyebrow">{m.role}</span><h2>{m.organization.name}</h2>{m.organizationId === ctx.organizationId ? <p>Currently open</p> : <OpenWorkspace organizationId={m.organizationId} />}</article>)}</div></>;
}
