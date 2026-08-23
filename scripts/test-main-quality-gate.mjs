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

// 2. Trigger pull_request hacia main sin filtro paths
assert.ok(
  workflow.includes("pull_request:") && workflow.includes("branches: [main]") || /pull_request:\s*\n\s+branches:\s*\n?\s*-\s*main/.test(workflow),
  "Debe ejecutarse en pull_request hacia main"
);
const pullRequestSection = workflow.slice(workflow.indexOf("pull_request:"));
const nextTriggerAfterPullRequest = pullRequestSection.indexOf("\n  push:");
assert.ok(nextTriggerAfterPullRequest > 0, "Debe existir sección push después de pull_request");
const pullRequestBlock = pullRequestSection.slice(0, nextTriggerAfterPullRequest);
assert.equal(pullRequestBlock.includes("paths:"), false, "pull_request no debe tener filtro paths");
assert.equal(pullRequestBlock.includes("paths-ignore:"), false, "pull_request no debe tener filtro paths-ignore");

// 3. Ejecución también en push a main
assert.ok(
  workflow.includes("push:") && workflow.includes("branches: [main]"),
  "Debe ejecutarse también en push a main"
);
const pushSection = workflow.slice(workflow.indexOf("push:"));
assert.equal(pushSection.includes("paths:"), false, "push no debe tener filtro paths");
assert.equal(pushSection.includes("paths-ignore:"), false, "push no debe tener filtro paths-ignore");

// 4. Ausencia de continue-on-error en el gate
assert.equal(workflow.includes("continue-on-error"), false, "El gate no debe usar continue-on-error");

// 5. Presencia de todas las suites
const testFiles = (await readdir("scripts")).filter((file) => file.startsWith("test-") && file.endsWith(".mjs")).sort();
assert.ok(testFiles.length > 0, "Debe existir al menos una suite");
if (workflow.includes("scripts/test-*.mjs")) {
  assert.ok(true, "El workflow invoca el patrón glob de suites");
} else {
  for (const file of testFiles) {
    assert.ok(workflow.includes(file), `El workflow debe ejecutar la suite ${file}`);
  }
}

// 6. Validación sintáctica y de schemas
assert.match(workflow, /node\s+--check/, "Debe validar sintaxis con node --check");
assert.ok(
  workflow.includes("schemas/") || workflow.includes("schema") || workflow.includes("JSON.parse"),
  "Debe validar que los schemas JSON son parseables"
);
assert.ok(
  workflow.includes("quality-history.schema.json") || workflow.includes("schemas"),
  "Debe validar al menos los schemas del histórico"
);

// 7. Permisos mínimos de lectura
assert.match(workflow, /permissions:\s*\n\s+contents:\s*read/, "Debe declarar permisos mínimos de lectura");

// 8. Nombre de job estable
assert.match(workflow, /jobs:\s*\n\s+\S+:\s*\n\s+name:\s*\S+/, "Debe tener un job con nombre estable");
assert.ok(workflow.includes("jobs:\n  check:") || workflow.includes("jobs:\n  gate:") || workflow.includes("jobs:\n  main-quality-gate:"), "El job debe tener un identificador estable");

console.log("Main quality gate contract válido.");
