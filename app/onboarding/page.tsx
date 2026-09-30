"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

const roles = [
  "Business Owner",
  "Marketing Professional",
  "Agency / Consultant",
  "Creator",
  "Team Member",
  "Other",
];

const industries = [
  "E-commerce & Retail",
  "Professional Services",
  "Health & Wellness",
  "Education & Coaching",
  "Technology & SaaS",
  "Music & Arts",
  "Real Estate",
  "Food & Hospitality",
  "Travel & Lifestyle",
  "Creator / Personal Brand",
  "Other",
];

const voices = [
  "Premium",
  "Warm",
  "Bold",
  "Minimal",
  "Educational",
  "Friendly",
  "Professional",
  "Playful",
];

const goals = [
  "Brand Awareness",
  "Sales",
  "Website Traffic",
  "Engagement",
  "Education",
  "Product Launch",
  "Lead Generation",
];

const frequencies = [
  "A few times a month",
  "1–2 times a week",
  "3–5 times a week",
  "Daily",
];

export default function OnboardingPage() {
  const router = useRouter();

  const [step, setStep] = useState(1);
  const [personName, setPersonName] = useState("");
  const [role, setRole] = useState("");
  const [brand, setBrand] = useState("");
  const [businessType, setBusinessType] = useState("");
  const [industry, setIndustry] = useState("");
  const [description, setDescription] = useState("");
  const [website, setWebsite] = useState("");
  const [targetAudience, setTargetAudience] = useState("");
  const [goal, setGoal] = useState("");
  const [voice, setVoice] = useState("Professional");
  const [postingFrequency, setPostingFrequency] = useState("");
  const [approvalRequired, setApprovalRequired] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");

  function next() {
    setMessage("");
    setStep((current) => Math.min(current + 1, 7));
  }

  function back() {
    setMessage("");
    setStep((current) => Math.max(current - 1, 1));
  }

  const canContinue =
    step === 1
      ? personName.trim().length >= 2 && role.length > 0
      : step === 2
        ? brand.trim().length >= 2 &&
          businessType.length > 0 &&
          industry.length > 0
        : step === 3
          ? description.trim().length >= 10
          : step === 4
            ? targetAudience.trim().length >= 3
            : step === 5
              ? goal.length > 0
              : step === 6
                ? voice.length > 0
                : true;

  async function finish() {
    setSaving(true);
    setMessage("");

    try {
      const res = await fetch("/api/onboarding/complete", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          personName: personName.trim(),
          role,
          brand: brand.trim(),
          website: website.trim() || undefined,
          businessType,
          industry,
          description: description.trim(),
          targetAudience: targetAudience.trim(),
          voice,
          goal,
          postingFrequency,
          approvalRequired,
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        setMessage(
          typeof data?.error === "string"
            ? data.error
            : "Could not complete onboarding."
        );
        return;
      }

      router.push("/dashboard");
      router.refresh();
    } catch {
      setMessage("Could not complete onboarding.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <main>
      <section className="hero v2">
        <div>
          <div className="eyebrow">WELCOME TO RUMI SOCIAL AI</div>
          <h1>Teach Campaign Director your brand once.</h1>
          <p>
            Set up your brand profile now. Rumi Social AI will remember it for
            future campaigns so you can focus on what you want to promote.
          </p>
        </div>

        <div className="orb">
          {step}
          <small>OF 7</small>
        </div>
      </section>

      <div className="steps">
        <b>1 You</b>
        <span>2 Business</span>
        <span>3 Website</span>
        <span>4 Audience</span>
        <span>5 Goals</span>
        <span>6 Voice</span>
        <span>7 Ready</span>
      </div>

      <section className="card" style={{ marginTop: 28 }}>
        {step === 1 && (
          <>
            <div className="eyebrow">STEP 1 · ABOUT YOU</div>
            <h2>Who are we building for?</h2>

            <label>Your name</label>
            <input
              value={personName}
              onChange={(e) => setPersonName(e.target.value)}
              placeholder="Your name"
            />

            <label>Your role</label>
            <div className="deliverables">
              {roles.map((item) => (
                <button
                  key={item}
                  type="button"
                  className={role === item ? "button" : ""}
                  onClick={() => setRole(item)}
                >
                  {item}
                </button>
              ))}
            </div>
          </>
        )}

        {step === 2 && (
          <>
            <div className="eyebrow">STEP 2 · YOUR BUSINESS</div>
            <h2>Tell us what you do.</h2>

            <label>Brand or business name</label>
            <input
              value={brand}
              onChange={(e) => setBrand(e.target.value)}
              placeholder="Rumi Guitars"
            />

            <label>Business type</label>
            <div className="deliverables">
              {[
                "E-commerce",
                "Local Business",
                "Professional Services",
                "Creator / Personal Brand",
                "Agency",
                "Restaurant / Hospitality",
                "Health / Wellness",
                "Education",
                "Technology / SaaS",
                "Other",
              ].map((item) => (
                <button
                  key={item}
                  type="button"
                  className={businessType === item ? "button" : ""}
                  onClick={() => setBusinessType(item)}
                >
                  {item}
                </button>
              ))}
            </div>

            <label>Industry</label>
            <div className="deliverables">
              {industries.map((item) => (
                <button
                  key={item}
                  type="button"
                  className={industry === item ? "button" : ""}
                  onClick={() => setIndustry(item)}
                >
                  {item}
                </button>
              ))}
            </div>
          </>
        )}

        {step === 3 && (
          <>
            <div className="eyebrow">STEP 3 · WEBSITE & BRAND</div>
            <h2>Give Campaign Director the source material.</h2>

            <label>Website or product URL</label>
            <input
              value={website}
              onChange={(e) => setWebsite(e.target.value)}
              placeholder="https://yourwebsite.com"
            />
            <p style={{ opacity: 0.7 }}>
              Optional. You can leave this blank if you do not have a website.
            </p>

            <label>Describe your business</label>
            <textarea
              rows={6}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="What do you make, sell, or help people with? What makes your business different?"
            />
          </>
        )}

        {step === 4 && (
          <>
            <div className="eyebrow">STEP 4 · YOUR AUDIENCE</div>
            <h2>Who should your content speak to?</h2>

            <label>Ideal audience or customer</label>
            <textarea
              rows={6}
              value={targetAudience}
              onChange={(e) => setTargetAudience(e.target.value)}
              placeholder="Describe the people you most want to reach, what they care about, and why they choose you."
            />
          </>
        )}

        {step === 5 && (
          <>
            <div className="eyebrow">STEP 5 · CONTENT GOALS</div>
            <h2>What should your content accomplish?</h2>

            <div className="deliverables">
              {goals.map((item) => (
                <button
                  key={item}
                  type="button"
                  className={goal === item ? "button" : ""}
                  onClick={() => setGoal(item)}
                >
                  {item}
                </button>
              ))}
            </div>
          </>
        )}

        {step === 6 && (
          <>
            <div className="eyebrow">STEP 6 · BRAND PERSONALITY</div>
            <h2>How should your brand sound?</h2>

            <div className="deliverables">
              {voices.map((item) => (
                <button
                  key={item}
                  type="button"
                  className={voice === item ? "button" : ""}
                  onClick={() => setVoice(item)}
                >
                  {item}
                </button>
              ))}
            </div>

            <p style={{ marginTop: 18 }}>
              Selected voice: <strong>{voice}</strong>
            </p>
          </>
        )}

        {step === 7 && (
          <>
            <div className="eyebrow">FINAL STEP · CONTENT PREFERENCES</div>
            <h2>Campaign Director is almost ready.</h2>

            <label>How often do you normally want to publish?</label>
            <div className="deliverables">
              {frequencies.map((item) => (
                <button
                  key={item}
                  type="button"
                  className={postingFrequency === item ? "button" : ""}
                  onClick={() => setPostingFrequency(item)}
                >
                  {item}
                </button>
              ))}
            </div>

            <label style={{ marginTop: 24 }}>Publishing approval</label>
            <div className="deliverables">
              <button
                type="button"
                className={approvalRequired ? "button" : ""}
                onClick={() => setApprovalRequired(true)}
              >
                Review before publishing
              </button>
              <button
                type="button"
                className={!approvalRequired ? "button" : ""}
                onClick={() => setApprovalRequired(false)}
              >
                Allow approved automation
              </button>
            </div>

            <div className="launchbox" style={{ marginTop: 28 }}>
              <h3>Campaign Director will remember</h3>
              <p>
                <strong>{brand}</strong>
                {industry ? ` · ${industry}` : ""}
              </p>
              <p>{description}</p>
              <p>
                <strong>Audience:</strong> {targetAudience}
              </p>
              <p>
                <strong>Goal:</strong> {goal}
              </p>
              <p>
                <strong>Voice:</strong> {voice}
              </p>
              {website && (
                <p>
                  <strong>Website:</strong> {website}
                </p>
              )}
            </div>

            <p style={{ marginTop: 20 }}>
              After setup, Create Everything will use this profile automatically.
              You can change it later in Brand Settings.
            </p>
          </>
        )}

        {message && <p style={{ marginTop: 18 }}>{message}</p>}

        <div
          style={{
            display: "flex",
            gap: 12,
            flexWrap: "wrap",
            marginTop: 28,
          }}
        >
          {step > 1 && (
            <button type="button" onClick={back} disabled={saving}>
              Back
            </button>
          )}

          {step < 7 ? (
            <button
              type="button"
              className="button"
              onClick={next}
              disabled={!canContinue}
            >
              Continue
            </button>
          ) : (
            <button
              type="button"
              className="button gold"
              onClick={finish}
              disabled={saving || !postingFrequency}
            >
              {saving ? "Preparing Campaign Director..." : "Finish Brand Setup"}
            </button>
          )}
        </div>
      </section>
    </main>
  );
}
