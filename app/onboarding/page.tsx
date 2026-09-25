"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

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

const businessTypes = [
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
];

export default function OnboardingPage() {
  const router = useRouter();

  const [step, setStep] = useState(1);
  const [brand, setBrand] = useState("");
  const [website, setWebsite] = useState("");
  const [businessType, setBusinessType] = useState("");
  const [goal, setGoal] = useState("");
  const [voice, setVoice] = useState("Professional");
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");

  function next() {
    setMessage("");
    setStep((current) => Math.min(current + 1, 5));
  }

  function back() {
    setMessage("");
    setStep((current) => Math.max(current - 1, 1));
  }

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
          brand: brand.trim(),
          website: website.trim() || undefined,
          businessType,
          voice,
          goal: goal.trim(),
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        setMessage(
          typeof data?.error === "string"
            ? data.error
            : "Could not complete onboarding.",
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
          <h1>Build your AI creative department.</h1>
          <p>
            Tell us about your business and we'll prepare your workspace for
            content, campaigns, and social publishing.
          </p>
        </div>

        <div className="orb">
          {step}
          <small>OF 5</small>
        </div>
      </section>

      <div className="steps">
        <b>1 Brand</b>
        <span>2 Business</span>
        <span>3 Goals</span>
        <span>4 Voice</span>
        <span>5 Ready</span>
      </div>

      <section className="card" style={{ marginTop: 28 }}>
        {step === 1 && (
          <>
            <div className="eyebrow">STEP 1</div>
            <h2>Tell us about your brand</h2>

            <label>
              <strong>Brand or Business Name</strong>
              <input
                value={brand}
                onChange={(e) => setBrand(e.target.value)}
                placeholder="Your brand name"
                autoFocus
                style={{
                  display: "block",
                  width: "100%",
                  marginTop: 8,
                }}
              />
            </label>

            <label style={{ display: "block", marginTop: 18 }}>
              <strong>Website</strong>
              <input
                value={website}
                onChange={(e) => setWebsite(e.target.value)}
                placeholder="https://example.com"
                style={{
                  display: "block",
                  width: "100%",
                  marginTop: 8,
                }}
              />
            </label>
          </>
        )}

        {step === 2 && (
          <>
            <div className="eyebrow">STEP 2</div>
            <h2>What kind of business is this?</h2>

            <select
              value={businessType}
              onChange={(e) => setBusinessType(e.target.value)}
              style={{ width: "100%" }}
            >
              <option value="">Select business type</option>
              {businessTypes.map((type) => (
                <option key={type} value={type}>
                  {type}
                </option>
              ))}
            </select>
          </>
        )}

        {step === 3 && (
          <>
            <div className="eyebrow">STEP 3</div>
            <h2>What do you want Rumi Social AI to help you achieve?</h2>

            <textarea
              rows={5}
              value={goal}
              onChange={(e) => setGoal(e.target.value)}
              placeholder="Example: Create consistent social content, grow awareness, and generate more qualified leads."
              style={{ width: "100%" }}
            />
          </>
        )}

        {step === 4 && (
          <>
            <div className="eyebrow">STEP 4</div>
            <h2>Choose your brand voice</h2>

            <div
              style={{
                display: "flex",
                gap: 10,
                flexWrap: "wrap",
              }}
            >
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

        {step === 5 && (
          <>
            <div className="eyebrow">FINAL STEP</div>
            <h2>Your creative workspace is ready to build.</h2>

            <p>
              <strong>Brand:</strong> {brand}
            </p>
            <p>
              <strong>Business Type:</strong> {businessType}
            </p>
            {website && (
              <p>
                <strong>Website:</strong> {website}
              </p>
            )}
            <p>
              <strong>Brand Voice:</strong> {voice}
            </p>
            <p>
              <strong>Primary Goal:</strong> {goal}
            </p>

            <p style={{ marginTop: 20 }}>
              Rumi Social AI will use this information to shape your brand
              profile and future campaign creation.
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

          {step < 5 ? (
            <button
              type="button"
              className="button"
              onClick={next}
              disabled={
                (step === 1 && brand.trim().length < 2) ||
                (step === 2 && !businessType) ||
                (step === 3 && goal.trim().length < 2)
              }
            >
              Continue
            </button>
          ) : (
            <button
              type="button"
              className="button gold"
              onClick={finish}
              disabled={saving}
            >
              {saving ? "Building Workspace..." : "Finish Setup"}
            </button>
          )}
        </div>
      </section>
    </main>
  );
}
