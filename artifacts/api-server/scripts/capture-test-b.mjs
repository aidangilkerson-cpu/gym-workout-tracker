// Actual red/green evidence; only an ignored source copy is ever mutated.
import { cp, mkdir, readFile, writeFile, symlink, rm } from "node:fs/promises";
import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
import { dirname, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

if (process.env.NODE_ENV === "production") throw new Error("Never run evidence capture in production.");
const api = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const output = resolve(api, "../../generated-artifacts/test-b");
const sandbox = resolve(output, "sandbox");
const sourcePath = resolve(api, "src/lib/dashboard-store.ts");
const original = await readFile(sourcePath, "utf8");
const correct = "      for (const set of entry.sets) totalReps += set.reps;";
const broken = "      totalReps += entry.sets.length; // INTENTIONAL TEST B BREAK: sets are not reps";
if (original.split(correct).length !== 2) throw new Error("Expected exactly one rep-total calculation; review before mutating.");
const digest = text => createHash("sha256").update(text).digest("hex");
const test = "test/dashboard-calculation.test.ts";
await mkdir(output, { recursive: true });
await rm(sandbox, { recursive: true, force: true });
await mkdir(resolve(sandbox, "test"), { recursive: true });
await cp(resolve(api, "src"), resolve(sandbox, "src"), { recursive: true });
await cp(resolve(api, test), resolve(sandbox, test));
await symlink(resolve(api, "node_modules"), resolve(sandbox, "node_modules"), "dir");
await writeFile(resolve(sandbox, "package.json"), '{"type":"module","private":true}\n');
await writeFile(resolve(sandbox, "vitest.config.ts"), `import { defineConfig } from "vitest/config";
export default defineConfig({test:{environment:"node",include:["${test}"],testTimeout:30000,fileParallelism:false}});
`);
const clonedSource = resolve(sandbox, "src/lib/dashboard-store.ts");
const args = [resolve(api, "node_modules/vitest/vitest.mjs"), "run",
  "--root", sandbox, "--config", resolve(sandbox, "vitest.config.ts"), "--reporter=verbose"];
const command = "vitest run --root <isolated-sandbox> --config <isolated-sandbox>/vitest.config.ts --reporter=verbose";
const escaped = value => value.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;");
const results = [];
try {
  for (const mode of ["red", "green"]) {
    const source = mode === "red" ? original.replace(correct, broken) : original;
    await writeFile(clonedSource, source);
    const started = new Date().toISOString();
    const run = spawnSync(process.execPath, args, {
      cwd: api, encoding: "utf8", timeout: 90000,
      env: { ...process.env, NODE_ENV: "test", NO_COLOR: "1", FORCE_COLOR: "0" },
    });
    const text = `${run.stdout ?? ""}${run.stderr ?? ""}`;
    await writeFile(resolve(output, `${mode}.txt`), `${command}\nStarted: ${started}\nExit code: ${run.status}\n\n${text}`);
    if (run.error || run.signal) throw new Error(`${mode} runner failed: ${run.error?.message ?? run.signal}`);
    if (mode === "red" && (run.status !== 1 || !text.includes("Total reps must sum 10+8+6+12+10+8 = 54")
      || !text.includes("expected 6 to be 54"))) {
      throw new Error("Red must fail at the real 6-versus-54 assertion, not setup or compilation.");
    }
    if (mode === "green" && run.status !== 0) throw new Error("Restored calculation did not pass; inspect green.txt.");
    const html = `<!doctype html><meta charset="utf-8"><title>Test B ${mode}: captured Vitest output</title>
<style>body{margin:0;padding:28px;background:#111;color:#eee;font:16px/1.45 monospace}h1{font:700 24px/1.3 sans-serif;color:${mode === "red" ? "#ff9c9c" : "#bdff55"}}pre{white-space:pre-wrap;overflow-wrap:anywhere}small{color:#ccc}</style>
<h1>Test B — ${mode === "red" ? "RED: count sets instead of summing reps in isolated copy" : "GREEN: original rep-summing calculation restored"}</h1>
<small>Actual Vitest stdout/stderr, unedited. This is an output viewer, not a terminal screenshot.<br>Started: ${started} · Exit code: ${run.status}<br>Command: ${escaped(command)}</small>
<pre>${escaped(text)}</pre>`;
    await writeFile(resolve(output, `${mode}.html`), html);
    const screenshot = spawnSync("chromium", [
      "--headless", "--no-sandbox", "--disable-gpu", "--hide-scrollbars",
      `--window-size=1350,${mode === "green" ? 550 : 1450}`,
      `--user-data-dir=${resolve(output, `chromium-${mode}`)}`,
      `--screenshot=${resolve(output, `${mode}.png`)}`,
      pathToFileURL(resolve(output, `${mode}.html`)).href,
    ], { encoding: "utf8", timeout: 30000 });
    if (screenshot.error || screenshot.status !== 0) throw new Error(`Screenshot failed: ${screenshot.stderr}`);
    results.push({ mode, exitCode: run.status, started, sourceSha256: digest(source) });
    console.log(`${mode.toUpperCase()}: exit ${run.status}; actual output and screenshot captured.`);
  }
} finally {
  await writeFile(clonedSource, original);
  if (digest(await readFile(sourcePath, "utf8")) !== digest(original)) throw new Error("Running app source unexpectedly changed.");
}
await writeFile(resolve(output, "manifest.json"), JSON.stringify({
  test, command, originalSourceSha256: digest(original), runningSourceUnchanged: true, results,
}, null, 2) + "\n");
console.log("Actual app source unchanged; isolated copy restored. Evidence: generated-artifacts/test-b/");
