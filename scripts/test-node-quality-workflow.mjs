import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const workflow = await readFile(".github/workflows/node-quality.yml", "utf8");

assert.match(
  workflow,
  /test-results-file:\n\s+description: Optional test diagnostics file to preserve as an artifact\n\s+required: false\n\s+type: string\n\s+default: ""/,
  "node-quality debe aceptar un fichero opcional de diagnóstico de tests",
);

const testsStep = workflow.indexOf("- name: Unit or deterministic tests");
const diagnosticsStep = workflow.indexOf("- name: Upload unit test diagnostics");
const coverageStep = workflow.indexOf("- name: Coverage");

assert.ok(testsStep >= 0, "debe existir el gate de tests");
assert.ok(diagnosticsStep > testsStep, "el diagnóstico debe ejecutarse después de los tests");
assert.ok(coverageStep > diagnosticsStep, "el diagnóstico debe preservarse antes de continuar con coverage");

const diagnosticsBlock = workflow.slice(diagnosticsStep, coverageStep);
assert.match(diagnosticsBlock, /if: \$\{\{ always\(\) && inputs\.test-results-file != '' \}\}/);
assert.match(diagnosticsBlock, /uses: actions\/upload-artifact@v4/);
assert.match(diagnosticsBlock, /name: unit-test-diagnostics/);
assert.match(diagnosticsBlock, /path: \$\{\{ inputs\.test-results-file \}\}/);
assert.match(diagnosticsBlock, /if-no-files-found: warn/);

assert.match(
  workflow,
  /- name: Unit or deterministic tests\n\s+id: tests\n\s+run: \$\{\{ inputs\.test-command \}\}/,
  "el gate debe seguir bloqueando con el test-command original",
);

console.log("Node quality workflow diagnostics contract válido.");
