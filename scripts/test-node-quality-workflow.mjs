import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

export function validateNodeQualityWorkflowContent(content) {
  const workflow = content.replace(/\r\n?/g, "\n");

  // 1. Inputs obligatorios (5)
  assert.match(
    workflow,
    /standard-version:\n\s+description: Published quality standard version used by this report\n\s+required: true\n\s+type: string/,
    "node-quality debe exigir el input standard-version"
  );
  assert.match(
    workflow,
    /standard-sha:\n\s+description: Immutable commit SHA of the quality standard used by this report\n\s+required: true\n\s+type: string/,
    "node-quality debe exigir el input standard-sha"
  );
  assert.match(
    workflow,
    /install-command:\n\s+description: Reproducible dependency installation command\n\s+required: true\n\s+type: string/,
    "node-quality debe exigir el input install-command"
  );
  assert.match(
    workflow,
    /build-command:\n\s+description: Build command\n\s+required: true\n\s+type: string/,
    "node-quality debe exigir el input build-command"
  );
  assert.match(
    workflow,
    /test-command:\n\s+description: Unit or deterministic test command\n\s+required: true\n\s+type: string/,
    "node-quality debe exigir el input test-command"
  );

  // 2. Inputs opcionales y valores por defecto (11)
  assert.match(
    workflow,
    /node-version:\n\s+description: Node\.js version used by the project\n\s+required: false\n\s+type: string\n\s+default: "22"/,
    "node-quality debe declarar node-version con default 22"
  );
  assert.match(
    workflow,
    /preflight-command:\n\s+description: Optional repository-specific preflight or readiness command\n\s+required: false\n\s+type: string\n\s+default: ""/,
    "node-quality debe declarar preflight-command opcional"
  );
  assert.match(
    workflow,
    /lint-command:\n\s+description: Lint or formatting command when applicable\n\s+required: false\n\s+type: string\n\s+default: ""/,
    "node-quality debe declarar lint-command opcional"
  );
  assert.match(
    workflow,
    /typecheck-command:\n\s+description: Optional type-check command\n\s+required: false\n\s+type: string\n\s+default: ""/,
    "node-quality debe declarar typecheck-command opcional"
  );
  assert.match(
    workflow,
    /test-results-file:\n\s+description: Optional test diagnostics file to preserve as an artifact\n\s+required: false\n\s+type: string\n\s+default: ""/,
    "node-quality debe declarar test-results-file opcional"
  );
  assert.match(
    workflow,
    /coverage-command:\n\s+description: Optional coverage command\n\s+required: false\n\s+type: string\n\s+default: ""/,
    "node-quality debe declarar coverage-command opcional"
  );
  assert.match(
    workflow,
    /e2e-install-command:\n\s+description: Optional browser or E2E dependency installation command\n\s+required: false\n\s+type: string\n\s+default: ""/,
    "node-quality debe declarar e2e-install-command opcional"
  );
  assert.match(
    workflow,
    /e2e-command:\n\s+description: Optional E2E command\n\s+required: false\n\s+type: string\n\s+default: ""/,
    "node-quality debe declarar e2e-command opcional"
  );
  assert.match(
    workflow,
    /smoke-command:\n\s+description: Optional artifact or startup smoke command\n\s+required: false\n\s+type: string\n\s+default: ""/,
    "node-quality debe declarar smoke-command opcional"
  );
  assert.match(
    workflow,
    /metrics-command:\n\s+description: Optional command that writes numeric metrics JSON\n\s+required: false\n\s+type: string\n\s+default: ""/,
    "node-quality debe declarar metrics-command opcional"
  );
  assert.match(
    workflow,
    /metrics-file:\n\s+description: Path to the numeric metrics JSON written by metrics-command\n\s+required: false\n\s+type: string\n\s+default: "\.quality\/metrics\.json"/,
    "node-quality debe declarar metrics-file con default .quality/metrics.json"
  );

  // 3. Steps deterministas y gates de ejecución
  assert.match(
    workflow,
    /- name: Install dependencies\n\s+id: install\n\s+run: \$\{\{ inputs\.install-command \}\}/,
    "node-quality debe ejecutar inputs.install-command en el step install"
  );
  assert.match(
    workflow,
    /- name: Build\n\s+id: build\n\s+run: \$\{\{ inputs\.build-command \}\}/,
    "node-quality debe ejecutar inputs.build-command en el step build"
  );
  assert.match(
    workflow,
    /- name: Unit or deterministic tests\n\s+id: tests\n\s+run: \$\{\{ inputs\.test-command \}\}/,
    "node-quality debe ejecutar inputs.test-command en el step tests"
  );

  // 4. Diagnóstico de tests y orden secuencial
  const testsStep = workflow.indexOf("- name: Unit or deterministic tests");
  const diagnosticsStep = workflow.indexOf("- name: Upload unit test diagnostics");
  const coverageStep = workflow.indexOf("- name: Coverage");
  assert.ok(testsStep >= 0, "debe existir el gate de tests");
  assert.ok(diagnosticsStep > testsStep, "el diagnóstico debe ejecutarse después de los tests");
  assert.ok(coverageStep > diagnosticsStep, "el diagnóstico debe preservarse antes de continuar con coverage");

  const diagnosticsBlock = workflow.slice(diagnosticsStep, coverageStep);
  assert.match(diagnosticsBlock, /if: \$\{\{ always\(\) && inputs\.test-results-file != '' \}\}/);
  assert.match(diagnosticsBlock, /uses: actions\/upload-artifact@v7/);
  assert.match(diagnosticsBlock, /name: unit-test-diagnostics/);
  assert.match(diagnosticsBlock, /path: \$\{\{ inputs\.test-results-file \}\}/);
  assert.match(diagnosticsBlock, /if-no-files-found: warn/);

  // 5. Steps condicionales de gates opcionales
  assert.match(
    workflow,
    /- name: Repository preflight\n\s+id: preflight\n\s+if: \$\{\{ inputs\.preflight-command != '' \}\}\n\s+run: \$\{\{ inputs\.preflight-command \}\}/,
    "node-quality debe ejecutar inputs.preflight-command condicionado"
  );
  assert.match(
    workflow,
    /- name: Lint or format\n\s+id: lint\n\s+if: \$\{\{ inputs\.lint-command != '' \}\}\n\s+run: \$\{\{ inputs\.lint-command \}\}/,
    "node-quality debe ejecutar inputs.lint-command condicionado"
  );
  assert.match(
    workflow,
    /- name: TypeScript or type checks\n\s+id: typecheck\n\s+if: \$\{\{ inputs\.typecheck-command != '' \}\}\n\s+run: \$\{\{ inputs\.typecheck-command \}\}/,
    "node-quality debe ejecutar inputs.typecheck-command condicionado"
  );
  assert.match(
    workflow,
    /- name: Coverage\n\s+id: coverage\n\s+if: \$\{\{ inputs\.coverage-command != '' \}\}\n\s+run: \$\{\{ inputs\.coverage-command \}\}/,
    "node-quality debe ejecutar inputs.coverage-command condicionado"
  );
  assert.match(
    workflow,
    /- name: Install E2E dependencies\n\s+id: e2e_install\n\s+if: \$\{\{ inputs\.e2e-install-command != '' \}\}\n\s+run: \$\{\{ inputs\.e2e-install-command \}\}/,
    "node-quality debe ejecutar inputs.e2e-install-command con id e2e_install"
  );
  assert.match(
    workflow,
    /- name: E2E tests\n\s+id: e2e\n\s+if: \$\{\{ inputs\.e2e-command != '' \}\}\n\s+run: \$\{\{ inputs\.e2e-command \}\}/,
    "node-quality debe ejecutar inputs.e2e-command condicionado"
  );
  assert.match(
    workflow,
    /- name: Smoke test\n\s+id: smoke\n\s+if: \$\{\{ inputs\.smoke-command != '' \}\}\n\s+run: \$\{\{ inputs\.smoke-command \}\}/,
    "node-quality debe ejecutar inputs.smoke-command condicionado"
  );
  assert.match(
    workflow,
    /- name: Additional metrics\n\s+id: metrics\n\s+if: \$\{\{ always\(\) && inputs\.metrics-command != '' \}\}\n\s+run: \$\{\{ inputs\.metrics-command \}\}/,
    "node-quality debe ejecutar inputs.metrics-command condicionado con always()"
  );

  // 6. Sparse-checkout y dependencias indispensables (4)
  const sparseStart = workflow.indexOf("sparse-checkout: |");
  assert.ok(sparseStart >= 0, "node-quality debe contener el bloque sparse-checkout");
  const generateStart = workflow.indexOf("- name: Generate quality metrics");
  assert.ok(generateStart > sparseStart, "Generate quality metrics debe ejecutarse tras el checkout de soporte");
  const sparseBlock = workflow.slice(sparseStart, generateStart);

  const requiredSparseFiles = [
    "schemas/quality-metrics.schema.json",
    "scripts/quality-contract.mjs",
    "scripts/generate-quality-metrics.mjs",
    "scripts/validate-quality-metrics.mjs"
  ];
  for (const file of requiredSparseFiles) {
    assert.ok(
      sparseBlock.includes(file),
      `sparse-checkout en node-quality debe incluir ${file}`
    );
  }

  // 7. Configuración de gates y variables de entorno
  assert.match(
    workflow,
    /QUALITY_PROJECT_KIND: node/,
    "node-quality debe definir QUALITY_PROJECT_KIND: node"
  );
  assert.match(
    workflow,
    /QUALITY_GATE_IDS: install preflight lint typecheck build tests coverage e2e-install e2e smoke metrics/,
    "node-quality debe definir QUALITY_GATE_IDS para los 11 gates exactos"
  );
  assert.match(
    workflow,
    /QUALITY_GATE_APPLICABILITY_INSTALL: required/,
    "node-quality debe declarar install como gate obligatorio"
  );
  assert.match(
    workflow,
    /QUALITY_GATE_APPLICABILITY_BUILD: required/,
    "node-quality debe declarar build como gate obligatorio"
  );
  assert.match(
    workflow,
    /QUALITY_GATE_APPLICABILITY_TESTS: required/,
    "node-quality debe declarar tests como gate obligatorio"
  );
  assert.match(
    workflow,
    /QUALITY_GATE_APPLICABILITY_E2E_INSTALL: \$\{\{ inputs\.e2e-install-command != '' && 'required' \|\| 'not-applicable' \}\}/,
    "node-quality debe condicionar la aplicabilidad del gate e2e-install"
  );
  assert.match(
    workflow,
    /QUALITY_GATE_STATUS_E2E_INSTALL: \$\{\{ steps\.e2e_install\.outcome \|\| 'unknown' \}\}/,
    "node-quality debe mapear status de e2e-install desde steps.e2e_install.outcome"
  );

  // 8. Validación y subida de artefactos
  assert.match(
    workflow,
    /- name: Validate quality metrics\n\s+if: \$\{\{ always\(\) \}\}\n\s+run: node \.quality-standard\/scripts\/validate-quality-metrics\.mjs quality-metrics\.json/,
    "node-quality debe validar el informe generado con validate-quality-metrics.mjs"
  );
  assert.match(
    workflow,
    /- name: Upload quality metrics\n\s+if: \$\{\{ always\(\) \}\}\n\s+uses: actions\/upload-artifact@v7\n\s+with:\n\s+name: quality-metrics\n\s+path: quality-metrics\.json\n\s+if-no-files-found: error/,
    "node-quality debe subir quality-metrics.json con if-no-files-found: error"
  );

  return true;
}

// 9. Validación del workflow real
const realWorkflowPath = ".github/workflows/node-quality.yml";
const rawContent = await readFile(realWorkflowPath, "utf8");
validateNodeQualityWorkflowContent(rawContent);

// 10. Comprobación sintética de tolerancia ante finales de línea CRLF (\r\n)
const crlfContent = rawContent.replace(/\r?\n/g, "\r\n");
assert.doesNotThrow(
  () => validateNodeQualityWorkflowContent(crlfContent),
  "El contrato de node-quality debe ser 100% tolerante a finales de línea CRLF"
);

console.log("Node quality workflow diagnostics contract válido.");
