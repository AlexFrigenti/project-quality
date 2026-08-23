import assert from "node:assert/strict";
import { readFile, readdir } from "node:fs/promises";

const workflowPath = ".github/workflows/main-quality-gate.yml";
let workflow;
try {
  workflow = await readFile(workflowPath, "utf8");
} catch {
  assert.fail(`El workflow obligatorio ${workflowPath} no existe`);
}
workflow = workflow.replace(/\r\n?/g, "\n");

// 1. Nombre estable y claramente identificable
assert.match(workflow, /name:\s*Main quality gate/, "El workflow debe tener un nombre estable 'Main quality gate'");

// 2. Trigger pull_request hacia main sin filtro paths y con tipos explícitos
assert.ok(
  workflow.includes("pull_request:") && workflow.includes("branches: [main]"),
  "Debe ejecutarse en pull_request hacia main"
);
const pullRequestSection = workflow.slice(workflow.indexOf("pull_request:"));
const nextTriggerAfterPullRequest = pullRequestSection.indexOf("\n  push:");
assert.ok(nextTriggerAfterPullRequest > 0, "Debe existir sección push después de pull_request");
const pullRequestBlock = pullRequestSection.slice(0, nextTriggerAfterPullRequest);
assert.equal(pullRequestBlock.includes("paths:"), false, "pull_request no debe tener filtro paths");
assert.equal(pullRequestBlock.includes("paths-ignore:"), false, "pull_request no debe tener filtro paths-ignore");
for (const type of ["opened", "synchronize", "reopened", "ready_for_review"]) {
  assert.ok(pullRequestBlock.includes(type), `pull_request debe incluir types: ${type}`);
}

// 3. Ejecución también en push a main sin paths
assert.ok(
  workflow.includes("push:") && workflow.includes("branches: [main]"),
  "Debe ejecutarse también en push a main"
);
const pushSection = workflow.slice(workflow.indexOf("push:"));
assert.equal(pushSection.includes("paths:"), false, "push no debe tener filtro paths");
assert.equal(pushSection.includes("paths-ignore:"), false, "push no debe tener filtro paths-ignore");

// 4. Ausencia de continue-on-error, || true y pull_request_target
assert.equal(workflow.includes("continue-on-error"), false, "El gate no debe usar continue-on-error");
assert.equal(workflow.includes("|| true"), false, "El gate no debe usar || true");
assert.equal(workflow.includes("pull_request_target"), false, "El gate no debe usar pull_request_target");

// 5. Persist-credentials false y shell bash estricto
assert.ok(workflow.includes("persist-credentials: false"), "Checkout debe usar persist-credentials: false");
assert.ok(workflow.includes("shell: bash"), "Debe usar shell: bash");
assert.ok(workflow.includes("set -euo pipefail"), "Debe usar set -euo pipefail");

// 6. Presencia de todas las suites con rutas citadas
assert.ok(workflow.includes('"$file"'), 'Las rutas deben estar citadas como "$file"');
assert.ok(workflow.includes("scripts/test-*.mjs"), "Debe recorrer todos los scripts/test-*.mjs");
assert.ok(workflow.includes("scripts/*.mjs"), "Debe recorrer todos los scripts/*.mjs para node --check");
assert.ok(workflow.includes("schemas/*.json"), "Debe recorrer todos los schemas/*.json");

// Compatibilidad: verificar que el patrón glob cubre todas las suites existentes
const testFiles = (await readdir("scripts")).filter((file) => file.startsWith("test-") && file.endsWith(".mjs")).sort();
assert.ok(testFiles.length > 0, "Debe existir al menos una suite");

// 7. Validación sintáctica y de schemas
assert.match(workflow, /node\s+--check\s+"\$file"/, "Debe validar sintaxis con node --check \"$file\"");
assert.ok(workflow.includes("JSON.parse"), "Debe validar que los schemas JSON son parseables");

// 8. Permisos mínimos de lectura
assert.match(workflow, /permissions:\s*\n\s+contents:\s*read/, "Debe declarar permisos mínimos de lectura");

// 9. Nombre de job estable
assert.match(workflow, /jobs:\s*\n\s+\S+:\s*\n\s+name:\s*\S+/, "Debe tener un job con nombre estable");
assert.ok(workflow.includes("jobs:\n  check:"), "El job debe tener identificador estable 'check'");

console.log("Main quality gate contract válido.");
