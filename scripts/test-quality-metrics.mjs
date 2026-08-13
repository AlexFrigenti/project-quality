import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
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

assert.throws(() => validateQualityMetrics({ ...report, standard: { ...report.standard, sha: "invalid" } }), /standard.sha/);
assert.throws(() => validateQualityMetrics({ ...report, metrics: { coverage: null } }), /no puede ser null/);

console.log("Quality metrics contract válido.");
