/**
 * The renderer root. U9 only needs it to mount and prove the security posture;
 * the board (U11), panels (U12), decision prompts (U13), and setup screen (U20)
 * replace this shell.
 */
export function App() {
  return (
    <div className="app-shell">
      <h1>Boomtown</h1>
      <p>Desktop shell online. Board and panels land in U11–U13.</p>
    </div>
  );
}
