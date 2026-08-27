import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

export function validateStaticQualityWorkflowContent(content) {
  const workflow = content.replace(/\r\n?/g, "\n");

  // 1. Inputs obligatorios
  assert.match(
    workflow,
    /standard-version:\n\s+description: Published quality standard version used by this report\n\s+required: true\n\s+type: string/,
    "static-quality debe exigir el input standard-version"
  );
  assert.match(
    workflow,
    /standard-sha:\n\s+description: Immutable commit SHA of the quality standard used by this report\n\s+required: true\n\s+type: string/,
    "static-quality debe exigir el input standard-sha"
  );
  assert.match(
    workflow,
    /validation-command:\n\s+description: Deterministic validation command for the static project\n\s+required: true\n\s+type: string/,
    "static-quality debe exigir el input validation-command"
  );

  // 2. Inputs opcionales y defaults
  assert.match(
    workflow,
    /node-version:\n\s+description: Node\.js version used by the validation scripts\n\s+required: false\n\s+type: string\n\s+default: "22"/,
    "static-quality debe declarar node-version con default 22"
  );
  assert.match(
    workflow,
    /smoke-command:\n\s+description: Optional startup or artifact smoke command\n\s+required: false\n\s+type: string\n\s+default: ""/,
    "static-quality debe declarar smoke-command opcional"
  );
  assert.match(
    workflow,
    /metrics-command:\n\s+description: Optional command that writes numeric metrics JSON\n\s+required: false\n\s+type: string\n\s+default: ""/,
    "static-quality debe declarar metrics-command opcional"
  );
  assert.match(
    workflow,
    /metrics-file:\n\s+description: Path to the numeric metrics JSON written by metrics-command\n\s+required: false\n\s+type: string\n\s+default: "\.quality\/metrics\.json"/,
    "static-quality debe declarar metrics-file con default .quality/metrics.json"
  );

  // 3. Step de validación determinista obligatorio
  assert.match(
    workflow,
    /- name: Deterministic static validation\n\s+id: validation\n\s+run: \$\{\{ inputs\.validation-command \}\}/,
    "static-quality debe ejecutar inputs.validation-command en el step validation"
  );

  // 4. Steps opcionales de smoke y metrics
  assert.match(
    workflow,
    /- name: Smoke test\n\s+id: smoke\n\s+if: \$\{\{ inputs\.smoke-command != '' \}\}\n\s+run: \$\{\{ inputs\.smoke-command \}\}/,
    "static-quality debe ejecutar inputs.smoke-command condicionado"
  );
  assert.match(
    workflow,
    /- name: Additional metrics\n\s+id: metrics\n\s+if: \$\{\{ always\(\) && inputs\.metrics-command != '' \}\}\n\s+run: \$\{\{ inputs\.metrics-command \}\}/,
    "static-quality debe ejecutar inputs.metrics-command condicionado con always()"
  );

  // 5. Sparse-checkout y dependencias indispensables
  const sparseStart = workflow.indexOf("sparse-checkout: |");
  assert.ok(sparseStart >= 0, "static-quality debe contener el bloque sparse-checkout");
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
      `sparse-checkout en static-quality debe incluir ${file}`
    );
  }

  // 6. Configuración de gates y variables de entorno
  assert.match(
    workflow,
    /QUALITY_PROJECT_KIND: static/,
    "static-quality debe definir QUALITY_PROJECT_KIND: static"
  );
  assert.match(
    workflow,
    /QUALITY_GATE_IDS: validation smoke metrics/,
    "static-quality debe definir QUALITY_GATE_IDS para validation, smoke y metrics"
  );
  assert.match(
    workflow,
    /QUALITY_GATE_APPLICABILITY_VALIDATION: required/,
    "static-quality debe declarar validation como gate obligatorio"
  );
  assert.match(
    workflow,
    /QUALITY_GATE_APPLICABILITY_SMOKE: \$\{\{ inputs\.smoke-command != '' && 'required' \|\| 'not-applicable' \}\}/,
    "static-quality debe condicionar la aplicabilidad del smoke gate"
  );
  assert.match(
    workflow,
    /QUALITY_GATE_APPLICABILITY_METRICS: \$\{\{ inputs\.metrics-command != '' && 'required' \|\| 'not-applicable' \}\}/,
    "static-quality debe condicionar la aplicabilidad del metrics gate"
  );

  // 7. Validación y subida de artefactos
  assert.match(
    workflow,
    /- name: Validate quality metrics\n\s+if: \$\{\{ always\(\) \}\}\n\s+run: node \.quality-standard\/scripts\/validate-quality-metrics\.mjs quality-metrics\.json/,
    "static-quality debe validar el informe generado con validate-quality-metrics.mjs"
  );
  assert.match(
    workflow,
    /- name: Upload quality metrics\n\s+if: \$\{\{ always\(\) \}\}\n\s+uses: actions\/upload-artifact@v7\n\s+with:\n\s+name: quality-metrics\n\s+path: quality-metrics\.json\n\s+if-no-files-found: error/,
    "static-quality debe subir quality-metrics.json con if-no-files-found: error"
  );

  return true;
}

// 8. Validación del workflow real
const realWorkflowPath = ".github/workflows/static-quality.yml";
const rawContent = await readFile(realWorkflowPath, "utf8");
validateStaticQualityWorkflowContent(rawContent);

// 9. Comprobación sintética de tolerancia ante finales de línea CRLF (\r\n)
const crlfContent = rawContent.replace(/\r?\n/g, "\r\n");
assert.doesNotThrow(
  () => validateStaticQualityWorkflowContent(crlfContent),
  "El contrato de static-quality debe ser 100% tolerante a finales de línea CRLF"
);

console.log("Static quality workflow contract válido.");
