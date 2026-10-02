"use client";

import { useState } from "react";

export default function ProofControls() {
  const [token, setToken] = useState("");
  const [result, setResult] = useState("Enter the host-generated proof token to inspect this installation.");
  const [busy, setBusy] = useState(false);

  async function run(path: string, method = "GET") {
    setBusy(true);
    try {
      const response = await fetch(path, { method, headers: { Authorization: `Bearer ${token}` }, cache: "no-store" });
      const body = await response.json();
      if (response.ok && typeof body.url === "string") window.location.assign(body.url);
      else setResult(JSON.stringify(body, null, 2));
    } catch { setResult("The runtime could not be reached. Check the host and diagnostics."); }
    finally { setBusy(false); }
  }

  return <section aria-label="Foundation controls">
    <label htmlFor="proof-token">Foundation proof token</label>
    <input id="proof-token" type="password" autoComplete="off" value={token} onChange={event => setToken(event.target.value)} />
    <p className="help">The token stays in this page’s memory. It grants foundation operator access; keep it private.</p>
    <div className="actions">
      <button disabled={busy || !token} onClick={() => run("/api/foundation/status")}>Inspect status</button>
      <button disabled={busy || !token} onClick={() => run("/api/foundation/probe", "POST")}>Queue persistence probe</button>
      <button disabled={busy || !token} onClick={() => run("/api/foundation/kick/authorize", "POST")}>Authorize Kick</button>
      <button disabled={busy || !token} onClick={() => run("/api/foundation/kick/subscribe", "POST")}>Subscribe to Kick events</button>
      <button disabled={busy || !token} onClick={() => run("/api/foundation/kick/refresh", "POST")}>Refresh Kick grant</button>
      <button disabled={busy || !token} onClick={() => run("/api/foundation/kick/capture", "POST")}>Capture next proof event</button>
    </div>
    <p className="help">Capture arms for five minutes and saves one verified !kekbot event encrypted on the host. Refresh uses the same token rotation as background work.</p>
    <pre aria-live="polite">{result}</pre>
  </section>;
}
