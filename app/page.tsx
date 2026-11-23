import Link from "next/link";
import { redirect } from "next/navigation";
import { auth } from "@/auth";

export default async function Home() {
  const session = await auth();
  if (session?.user) redirect("/dashboard");

  return (
    <div className="landing">
      <nav>
        <b style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <img src="/rumi-social-icon.png" alt="Rumi Social AI icon" width={56} height={56} style={{ borderRadius: 10 }} />
          RUMI SOCIAL AI
        </b>
        <div>
          <Link href="/login">Sign in</Link>
          <Link className="button" href="/signup">Start free</Link>
        </div>
      </nav>
      <section className="landhero">
        <span>THE AI CREATIVE OPERATING SYSTEM</span>
        <h1>One idea.<br />An entire campaign.</h1>
        <p>Strategy, social creative, Reels, approvals, scheduling and publishing—built around your brand.</p>
        <div>
          <Link className="button gold" href="/signup">Start with 100 credits</Link>
          <Link className="demolink" href="/login">Open workspace →</Link>
        </div>
      </section>
      <section className="flow">
        {["BRIEF", "STRATEGY", "DESIGN", "VIDEO", "APPROVE", "PUBLISH"].map((step, index) => (
          <div key={step}>
            <b>0{index + 1}</b>
            <span>{step}</span>
          </div>
        ))}
      </section>
      <section className="promise">
        <div>
          <span className="eyebrow">CREATE EVERYTHING</span>
          <h2>Your creative department in one command.</h2>
        </div>
        <p>Give Rumi Social AI a product, service or campaign idea. It prepares a complete campaign while Brand Brain keeps the work consistent with your voice and positioning.</p>
      </section>
    </div>
  );
}
