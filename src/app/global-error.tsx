"use client";

// Last-resort boundary for errors in the root layout itself.
export default function GlobalError({ reset }: { error: Error; reset: () => void }) {
  return (
    <html lang="en">
      <body style={{ margin: 0, minHeight: "100vh", display: "grid", placeItems: "center", background: "#0E0E10", color: "#FAFAFA", fontFamily: "system-ui, sans-serif" }}>
        <div style={{ textAlign: "center", padding: 24 }}>
          <h1 style={{ fontSize: 20 }}>RevVisual couldn&apos;t load</h1>
          <p style={{ color: "#A1A1AA", fontSize: 14 }}>Your saved projects are not affected.</p>
          <button onClick={reset} style={{ marginTop: 12, padding: "8px 16px", borderRadius: 8, border: 0, background: "#0A0A0A", color: "#fff", cursor: "pointer" }}>
            Reload
          </button>
        </div>
      </body>
    </html>
  );
}
