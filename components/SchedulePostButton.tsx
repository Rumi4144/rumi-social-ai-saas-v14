"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

type Connection = {
  id: string;
  provider: string;
  accountName: string | null;
  externalId: string | null;
};

export default function SchedulePostButton({
  contentItemId,
  initialStatus,
  initialScheduledFor,
}: {
  contentItemId: string;
  initialStatus: string;
  initialScheduledFor?: string | null;
}) {
  const router = useRouter();

  const [open, setOpen] = useState(false);
  const [connections, setConnections] = useState<Connection[]>([]);
  const [selected, setSelected] = useState<string[]>([]);
  const [scheduledFor, setScheduledFor] = useState("");
  const [status, setStatus] = useState(initialStatus);
  const [savedTime, setSavedTime] = useState(initialScheduledFor || "");
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    setStatus(initialStatus);
    setSavedTime(initialScheduledFor || "");
  }, [initialStatus, initialScheduledFor]);

  useEffect(() => {
    if (!open || connections.length > 0) return;

    async function loadConnections() {
      setLoading(true);
      setError("");

      try {
        const res = await fetch("/api/social/connections", {
          cache: "no-store",
        });

        const data = await res.json();

        if (!res.ok) {
          throw new Error(
            typeof data?.error === "string"
              ? data.error
              : "Could not load social accounts.",
          );
        }

        const list = Array.isArray(data.connections) ? data.connections : [];

        setConnections(list);

        if (list.length === 1) {
          setSelected([list[0].id]);
        }
      } catch (error) {
        setError(
          error instanceof Error
            ? error.message
            : "Could not load social accounts.",
        );
      } finally {
        setLoading(false);
      }
    }

    loadConnections();
  }, [open, connections.length]);

  function toggleConnection(id: string) {
    setSelected((current) =>
      current.includes(id)
        ? current.filter((value) => value !== id)
        : [...current, id],
    );
  }

  async function schedule() {
    if (!scheduledFor) {
      setError("Choose a date and time.");
      return;
    }

    if (selected.length === 0) {
      setError("Choose at least one social account.");
      return;
    }

    setBusy(true);
    setError("");

    try {
      const isoTime = new Date(scheduledFor).toISOString();

      const res = await fetch("/api/publishing/schedule", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          contentItemId,
          socialConnectionIds: selected,
          scheduledFor: isoTime,
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(
          typeof data?.error === "string"
            ? data.error
            : "Could not schedule post.",
        );
      }

      setStatus("scheduled");
      setSavedTime(isoTime);
      setOpen(false);

      const scrollY = window.scrollY;
      router.refresh();

      requestAnimationFrame(() => {
        window.scrollTo({
          top: scrollY,
          behavior: "instant",
        });
      });
    } catch (error) {
      setError(
        error instanceof Error ? error.message : "Could not schedule post.",
      );
    } finally {
      setBusy(false);
    }
  }

  if (status === "scheduled") {
    return (
      <span>
        ✓ Scheduled
        {savedTime ? ` · ${new Date(savedTime).toLocaleString()}` : ""}
      </span>
    );
  }

  if (status !== "approved") {
    return null;
  }

  return (
    <>
      <button type="button" onClick={() => setOpen(!open)}>
        Schedule
      </button>

      {open && (
        <div
          style={{
            marginTop: 12,
            padding: 16,
            border: "1px solid rgba(0,0,0,.12)",
            borderRadius: 12,
            width: "100%",
          }}
        >
          <strong>Schedule Post</strong>

          <div style={{ marginTop: 12 }}>
            {loading && <p>Loading connected accounts...</p>}

            {!loading && connections.length === 0 && (
              <p>No connected social accounts found.</p>
            )}

            {connections.map((connection) => (
              <label
                key={connection.id}
                style={{
                  display: "block",
                  marginBottom: 8,
                }}
              >
                <input
                  type="checkbox"
                  checked={selected.includes(connection.id)}
                  onChange={() => toggleConnection(connection.id)}
                />{" "}
                {connection.provider}
                {connection.accountName ? ` · ${connection.accountName}` : ""}
              </label>
            ))}
          </div>

          <input
            type="datetime-local"
            value={scheduledFor}
            onChange={(e) => setScheduledFor(e.target.value)}
            style={{
              display: "block",
              marginTop: 12,
              marginBottom: 12,
            }}
          />

          <button
            type="button"
            onClick={schedule}
            disabled={busy || connections.length === 0}
          >
            {busy ? "Scheduling..." : "Schedule Post"}
          </button>

          {error && (
            <p
              style={{
                marginTop: 10,
                fontSize: 12,
              }}
            >
              {error}
            </p>
          )}
        </div>
      )}
    </>
  );
}
