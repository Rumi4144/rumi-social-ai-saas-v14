"use client";

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  const suspended = error.message === "WORKSPACE_SUSPENDED";

  if (suspended) {
    return (
      <main className="fatal">
        <div>
          <span className="eyebrow">RUMI SOCIAL AI</span>

          <h1>Workspace Temporarily Unavailable</h1>

          <p>
            This workspace is currently suspended. Please contact your
            administrator for assistance.
          </p>

          <a className="button" href="/login">
            Return to Sign In
          </a>
        </div>
      </main>
    );
  }

  return (
    <main className="fatal">
      <div>
        <span className="eyebrow">SOMETHING WENT WRONG</span>

        <h1>We couldn't finish that action.</h1>

        <p>
          {process.env.NODE_ENV === "development"
            ? error.message
            : "You can safely try again."}
        </p>

        <button className="button" onClick={reset}>
          Try again
        </button>
      </div>
    </main>
  );
}
