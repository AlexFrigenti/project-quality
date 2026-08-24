import assert from "node:assert/strict";
import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";

// Allowlist explícita de majors compatibles con el runtime Node 24,
// verificada contra el campo runs.using del action.yml oficial de cada tag.
// upload-pages-artifact es composite: su v4 envuelve actions/upload-artifact@v4
// (Node 20), por lo que SOLO su v5 (que envuelve upload-artifact en Node 24)
// está permitida.
const ALLOWED_MAJORS = new Map([
  ["actions/checkout", new Set(["v6", "v7"])],
  ["actions/setup-node", new Set(["v6", "v7"])],
  ["actions/upload-artifact", new Set(["v6", "v7"])],
  ["actions/download-artifact", new Set(["v7", "v8"])],
  ["actions/configure-pages", new Set(["v6"])],
  ["actions/deploy-pages", new Set(["v5"])],
  ["actions/upload-pages-artifact", new Set(["v5"])]
]);

const PROJECT_NODE_VERSION = '"22"';

function validateContent(file, content) {
  const lines = content.split(/\r?\n/);
  for (let index = 0; index < lines.length; index += 1) {
    const match = lines[index].match(/^\s*(?:-\s+)?uses:\s*(\S+)\s*$/);
    if (!match) continue;
    const uses = match[1];
    const atSign = uses.lastIndexOf("@");
    assert.ok(atSign > 0, `${file}:${index + 1}: uses sin ref: ${uses}`);
    const action = uses.slice(0, atSign);
    const ref = uses.slice(atSign + 1);
    if (!ALLOWED_MAJORS.has(action)) continue;
    const majorMatch = ref.match(/^v(\d+)/);
    assert.ok(majorMatch, `${file}:${index + 1}: ${action} debe usar un tag de versión mayor (vN), no "${ref}"`);
    const major = "v" + majorMatch[1];
    assert.ok(
      ALLOWED_MAJORS.get(action).has(major),
      `${file}:${index + 1}: ${action}@${ref} usa el major ${major}, basado en Node 20 u obsoleto. Majors compatibles con Node 24: ${[...ALLOWED_MAJORS.get(action)].join(", ")}.`
    );
  }

  // El runtime del proyecto permanece en Node 22.
  const nodeVersionMatches = [...content.matchAll(/node-version:\s*(.+)/g)];
  for (const nodeVersion of nodeVersionMatches) {
    const value = nodeVersion[1].trim();
    if (/^\$\{\{/.test(value)) continue;
    if (/^(description|#)/.test(value)) continue;
    assert.equal(
      value,
      PROJECT_NODE_VERSION,
      `${file}: node-version debe permanecer en ${PROJECT_NODE_VERSION} (runtime del proyecto)`
    );
  }
}

const workflowDir = ".github/workflows";
const files = (await readdir(workflowDir)).filter((file) => file.endsWith(".yml")).sort();
assert.ok(files.includes("main-quality-gate.yml"), "Debe existir el workflow main-quality-gate.yml");

for (const file of files) {
  validateContent(file, await readFile(join(workflowDir, file), "utf8"));
}

{
  // Regresión sintética: upload-pages-artifact@v4 es composite y envuelve
  // actions/upload-artifact@v4 (Node 20). El contrato debe rechazarlo.
  const synthetic = [
    "name: synthetic",
    "on: push",
    "jobs:",
    "  demo:",
    "    runs-on: ubuntu-latest",
    "    steps:",
    "      - uses: actions/upload-pages-artifact@v5",
    "      - uses: actions/upload-pages-artifact@v4"
  ].join("\n");
  assert.doesNotThrow(
    () => validateContent("synthetic-v5.yml", synthetic.replace("@v4", "@v5")),
    "upload-pages-artifact@v5 debe seguir aceptándose."
  );
  assert.throws(
    () => validateContent("synthetic-v4.yml", synthetic),
    /upload-pages-artifact@v4 usa el major v4, basado en Node 20/,
    "upload-pages-artifact@v4 debe rechazarse: internamente usa upload-artifact@v4 (Node 20)."
  );
}

console.log("Actions runtime contract válido.");
