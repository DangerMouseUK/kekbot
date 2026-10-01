import ProofControls from "./proof-controls.tsx";

export default function Home() {
  return <main>
    <p className="eyebrow">SELF-HOSTED · MIT · FOUNDATION</p>
    <h1>KekBot</h1>
    <p>Prove the connection. Preserve the state.</p>
    <p>This is the foundation harness. Commands, Discord controls, overlays, and media are tracked in the roadmap; they are not release-ready yet.</p>
    <ProofControls />
    <p className="help">Run <code>pnpm kekbot init</code> before starting the runtime. Follow <code>docs/FOUNDATION.md</code> for public HTTPS setup, signed fixtures, and live acceptance.</p>
  </main>;
}
