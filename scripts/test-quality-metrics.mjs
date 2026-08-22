import assert from "node:assert/strict";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { buildQualityMetrics } from "./generate-quality-metrics.mjs";
import { validateQualityMetrics } from "./validate-quality-metrics.mjs";

const baseEnv = {
  GITHUB_REPOSITORY: "AlexFrigenti/example",
  GITHUB_SHA: "0123456789abcdef0123456789abcdef01234567",
  GITHUB_REF: "refs/heads/main",
  GITHUB_REF_NAME: "main",
  GITHUB_EVENT_NAME: "push",
  GITHUB_WORKFLOW: "Quality checks",
  GITHUB_RUN_ID: "123",
  GITHUB_RUN_ATTEMPT: "1",
  GITHUB_SERVER_URL: "https://github.com",
  QUALITY_STANDARD_VERSION: "v1.1.0",
  QUALITY_STANDARD_SHA: "abcdefabcdefabcdefabcdefabcdefabcdefabcd",
  QUALITY_PROJECT_KIND: "node",
  QUALITY_GATE_IDS: "install build tests metrics",
  QUALITY_GATE_APPLICABILITY_INSTALL: "required",
  QUALITY_GATE_APPLICABILITY_BUILD: "required",
  QUALITY_GATE_APPLICABILITY_TESTS: "required",
  QUALITY_GATE_APPLICABILITY_METRICS: "not-applicable",
  QUALITY_GATE_STATUS_INSTALL: "success",
  QUALITY_GATE_STATUS_BUILD: "success",
  QUALITY_GATE_STATUS_TESTS: "success",
  QUALITY_GATE_STATUS_METRICS: ""
};

const report = await buildQualityMetrics({
  env: baseEnv,
  now: new Date("2026-08-13T10:00:00.000Z")
});
validateQualityMetrics(report);
assert.equal(report.schemaVersion, 1);
assert.equal(report.conclusion, "passed");
assert.equal(report.gates.find((gate) => gate.id === "metrics").status, "not-applicable");
assert.deepEqual(report.metrics, {});

const metricsDirectory = await mkdtemp(join(tmpdir(), "quality-metrics-"));
const metricsFile = join(metricsDirectory, "metrics.json");
await writeFile(metricsFile, JSON.stringify({
  metrics: {
    tests: { total: 12, passed: 12 },
    coverage: { lines: 86.4, branches: 78.1 }
  }
}));
const metricsReport = await buildQualityMetrics({
  env: {
    ...baseEnv,
    QUALITY_GATE_APPLICABILITY_METRICS: "required",
    QUALITY_GATE_STATUS_METRICS: "success",
    QUALITY_METRICS_FILE: metricsFile,
    QUALITY_METRICS_FILE_REQUIRED: "true"
  },
  now: new Date("2026-08-13T10:00:00.000Z")
});
validateQualityMetrics(metricsReport);
assert.deepEqual(metricsReport.metrics, {
  tests: { total: 12, passed: 12 },
  coverage: { lines: 86.4, branches: 78.1 }
});
await rm(metricsDirectory, { recursive: true, force: true });

const failedReport = await buildQualityMetrics({
  env: {
    ...baseEnv,
    QUALITY_GATE_STATUS_BUILD: "failure"
  },
  now: new Date("2026-08-13T10:00:00.000Z")
});
validateQualityMetrics(failedReport);
assert.equal(failedReport.conclusion, "failed");
assert.equal(failedReport.gates.find((gate) => gate.id === "build").status, "failed");

const schema = JSON.parse(await readFile("schemas/quality-metrics.schema.json", "utf8"));
assert.equal(schema.properties.schemaVersion.const, 1);
assert.ok(schema.required.includes("gates"));
assert.ok(schema.required.includes("metrics"));
assert.ok(schema.$defs.gate.properties.applicability.enum.includes("not-applicable"));
assert.ok(schema.$defs.gate.properties.status.enum.includes("unknown"));
assert.equal(schema.properties.metrics.propertyNames.pattern, "^[a-zA-Z][a-zA-Z0-9_-]*$");
assert.equal(schema.$defs.metricValue.oneOf[1].propertyNames.pattern, "^[a-zA-Z][a-zA-Z0-9_-]*$");
assert.equal(schema.properties.run.properties.startedAt.pattern, "^\\d{4}-\\d{2}-\\d{2}T\\d{2}:\\d{2}:\\d{2}(?:\\.\\d+)?(?:Z|[+-]\\d{2}:\\d{2})$");
assert.equal(schema.properties.run.properties.completedAt.pattern, schema.properties.run.properties.startedAt.pattern);
assert.equal(schema.properties.run.properties.url.pattern, "^https?://");
assert.equal(schema.$defs.evidence.properties.url.pattern, "^https?://");
assert.equal(schema.properties.project.properties.name.maxLength, 120);
assert.equal(schema.$defs.evidence.properties.label.maxLength, 160);
assert.equal(schema.$defs.gate.properties.label.maxLength, 160);
assert.equal(schema.$defs.gate.properties.details.maxLength, 400);

const notApplicableRule = schema.$defs.gate.allOf.find(
  (rule) => rule.if?.properties?.applicability?.const === "not-applicable"
);
assert.equal(notApplicableRule.then.properties.status.const, "not-applicable");
const applicableRule = schema.$defs.gate.allOf.find(
  (rule) => rule.if?.properties?.applicability?.enum?.join(",") === "required,optional"
);
assert.equal(applicableRule.then.properties.status.not.const, "not-applicable");

assert.throws(() => validateQualityMetrics({ ...report, standard: { ...report.standard, sha: "invalid" } }), /standard.sha/);
assert.throws(() => validateQualityMetrics({ ...report, metrics: { coverage: null } }), /no puede ser null/);
assert.throws(
  () => validateQualityMetrics({ ...report, project: { ...report.project, name: "x".repeat(121) } }),
  /project.name.*límite/
);
assert.throws(
  () => validateQualityMetrics({ ...report, evidence: [{ ...report.evidence[0], label: "x".repeat(161) }] }),
  /evidence\[0\]\.label.*límite/
);
assert.throws(
  () => validateQualityMetrics({ ...report, gates: [{ ...report.gates[0], label: "x".repeat(161) }] }),
  /gates\[0\]\.label.*límite/
);
assert.throws(
  () => validateQualityMetrics({ ...report, gates: [{ ...report.gates[0], details: "x".repeat(401) }] }),
  /gates\[0\]\.details.*límite/
);
assert.throws(
  () => validateQualityMetrics({ ...report, run: { ...report.run, startedAt: "2026-08-13" } }),
  /run.startedAt.*RFC3339/
);

// Regresiones: rechazo de propiedades desconocidas en los 7 objetos cerrados
assert.throws(() => validateQualityMetrics({ ...report, extraField: "invalido" }), /report\.extraField no está permitido/);
assert.throws(() => validateQualityMetrics({ ...report, project: { ...report.project, extraField: "invalido" } }), /project\.extraField no está permitido/);
assert.throws(() => validateQualityMetrics({ ...report, commit: { ...report.commit, extraField: "invalido" } }), /commit\.extraField no está permitido/);
assert.throws(() => validateQualityMetrics({ ...report, run: { ...report.run, extraField: "invalido" } }), /run\.extraField no está permitido/);
assert.throws(() => validateQualityMetrics({ ...report, standard: { ...report.standard, extraField: "invalido" } }), /standard\.extraField no está permitido/);
assert.throws(() => validateQualityMetrics({ ...report, gates: [{ ...report.gates[0], extraField: "invalido" }] }), /gates\[0\]\.extraField no está permitido/);
assert.throws(() => validateQualityMetrics({ ...report, evidence: [{ ...report.evidence[0], extraField: "invalido" }] }), /evidence\[0\]\.extraField no está permitido/);
assert.throws(() => validateQualityMetrics({
  ...report,
  gates: [{
    ...report.gates[0],
    evidence: [{ ...report.gates[0].evidence[0], extraField: "invalido" }]
  }]
}), /gates\[0\]\.evidence\[0\]\.extraField no está permitido/);

// Extensibilidad y nombres válidos de metrics (raíz y anidados)
const validMetricNames = [
  "coverage",
  "test_count",
  "test-count",
  "test1",
  "TestMetric",
  "custom_metric",
  "suite-performance",
  "CamelCase"
];

for (const name of validMetricNames) {
  const dynamicMetricsReport = {
    ...report,
    metrics: {
      [name]: 42,
      nestedContainer: {
        [name]: 100
      }
    }
  };
  assert.doesNotThrow(
    () => validateQualityMetrics(dynamicMetricsReport),
    `metrics debe aceptar el nombre válido "${name}" en raíz y anidado`
  );
}

// Rechazo determinista de nombres inválidos en metrics (raíz y anidados)
const invalidMetricNames = [
  "1test",
  "_test",
  "-test",
  "test.value",
  "test value",
  "test/value",
  "test:value",
  "área",
  ""
];

for (const name of invalidMetricNames) {
  // En raíz de metrics
  assert.throws(
    () => validateQualityMetrics({ ...report, metrics: { [name]: 10 } }),
    /no es válido/,
    `metrics debe rechazar el nombre inválido "${name}" en la raíz`
  );

  // En nivel anidado
  assert.throws(
    () => validateQualityMetrics({ ...report, metrics: { validGroup: { [name]: 10 } } }),
    /no es válido/,
    `metrics debe rechazar el nombre inválido "${name}" en nivel anidado`
  );
}

console.log("Quality metrics contract válido.");
