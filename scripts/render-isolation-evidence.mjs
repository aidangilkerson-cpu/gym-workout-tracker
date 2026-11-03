import { readFile, writeFile } from "node:fs/promises";

const mode = process.argv[2];
if (!["red", "green"].includes(mode)) throw new Error("Choose red or green.");
const logPath = `generated-artifacts/feature-3/isolation-${mode}.log`;
const output = await readFile(logPath, "utf8");
const red = mode === "red";
if (red ? !output.includes("AssertionError: expected") : !output.includes("8 passed (8)")) {
  throw new Error("The actual test output does not match this evidence state.");
}
const escape = (value) => value.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;");
const lines = output.split("\n");
const excerpt = red
  ? [
      ...lines.filter((line) => line.includes("× test/") || line.includes("→ expected")),
      "",
      ...lines.slice(lines.findIndex((line) => line.startsWith("AssertionError:")), lines.findIndex((line) => line.startsWith("AssertionError:")) + 12),
      ...lines.filter((line) => line.includes('"workoutName"')),
      "",
      ...lines.filter((line) => line.trim().startsWith("Test Files") || line.trim().startsWith("Tests ")),
    ].join("\n")
  : lines.filter((line) => line.includes("✓ test/") || line.trim().startsWith("Test Files") || line.trim().startsWith("Tests ")).join("\n");
const html = `<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width">
<title>LiftLedgr — Data isolation test ${mode}</title>
<style>
*{box-sizing:border-box}body{margin:0;background:#111512;color:#eef1ed;font-family:system-ui,sans-serif;padding:40px}
main{max-width:1060px;margin:auto}h1{font-size:32px;line-height:1.2;margin:14px 0}p{line-height:1.6;color:#c0c9c1;max-width:860px}
.badge{font:700 13px monospace;letter-spacing:.12em;color:${red ? "#ff9696" : "#bcf451"}}
code,pre{font-family:ui-monospace,SFMono-Regular,Consolas,monospace}
pre{background:#080b09;border:1px solid #3d483e;border-left:4px solid ${red ? "#f57676" : "#bcf451"};padding:24px;border-radius:12px;font-size:13px;line-height:1.65;white-space:pre-wrap;overflow-wrap:anywhere}
details{margin-top:24px}summary{cursor:pointer;color:#c0c9c1}.note{font-size:13px}
</style><main>
<div class="badge">${red ? "RED — INTENTIONAL FAILURE" : "GREEN — CORRECT CODE RESTORED"}</div>
<h1>A. Data isolation</h1>
<p>Given User A has a saved session and User B has none, User B's history must be empty and must not contain User A's workout data.</p>
<p>${red
  ? "The owner filter in the session-list query was temporarily removed. The real Vitest + Supertest request returned User A's session to User B, so the assertion failed as expected."
  : "The owner filter was restored. The same isolation assertion passed, along with the seven other API tests. Fixtures used real PostgreSQL and were rolled back."}</p>
<p class="note">Actual captured command: <code>pnpm --filter @workspace/api-server exec vitest run ${red ? "-t 'A. Data isolation' " : ""}--reporter=verbose --no-color</code><br>
The test substitutes provider identity only; database queries and authorization logic are real. This is server-test evidence, not a browser-login test.</p>
<pre>${escape(excerpt)}</pre>
<details><summary>Full unedited test output</summary><pre>${escape(output)}</pre></details>
<p class="note">Source log: ${logPath}. The intentional break is not included in the final source code.</p>
</main></html>`;
await writeFile(`generated-artifacts/feature-3/isolation-${mode}.html`, html);
