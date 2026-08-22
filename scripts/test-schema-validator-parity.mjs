import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import {
  APPLICABILITIES,
  CONCLUSIONS,
  CONTRACT_LIMITS,
  CONTRACT_PATTERNS,
  EVIDENCE_KINDS,
  METRICS_GATE_STATUSES,
  PROCESS_STATUSES,
  QUALITY_STATUSES
} from "./quality-contract.mjs";

async function schema(file) {
  return JSON.parse(await readFile(file, "utf8"));
}

function assertEnum(schemaValue, expected, message) {
  assert.deepEqual(new Set(schemaValue), expected, message);
}

function assertGateRelations(gate, label) {
  const notApplicableRule = gate.allOf.find(
    (rule) => rule.if?.properties?.applicability?.const === "not-applicable"
  );
  assert.equal(notApplicableRule.then.properties.status.const, "not-applicable", `${label}: relación not-applicable`);

  const applicableRule = gate.allOf.find(
    (rule) => rule.if?.properties?.applicability?.enum?.join(",") === "required,optional"
  );
  assert.equal(applicableRule.then.properties.status.not.const, "not-applicable", `${label}: relación aplicable`);
}

const metrics = await schema("schemas/quality-metrics.schema.json");
const history = await schema("schemas/quality-history.schema.json");
const historyIndex = await schema("schemas/quality-history-index.schema.json");
const nodeWorkflow = await readFile(".github/workflows/node-quality.yml", "utf8");
const staticWorkflow = await readFile(".github/workflows/static-quality.yml", "utf8");

assert.match(nodeWorkflow, /sparse-checkout:[\s\S]*scripts\/quality-contract\.mjs/);
assert.match(staticWorkflow, /sparse-checkout:[\s\S]*scripts\/quality-contract\.mjs/);

for (const root of [metrics, history, historyIndex]) {
  assert.equal(root.additionalProperties, false, `${root.title}: el objeto raíz debe estar cerrado`);
}

assert.equal(metrics.properties.project.properties.id.pattern, CONTRACT_PATTERNS.identifier);
assert.equal(metrics.properties.project.properties.name.maxLength, CONTRACT_LIMITS.projectName);
assert.equal(metrics.properties.project.properties.repository.pattern, CONTRACT_PATTERNS.repository);
assert.equal(metrics.properties.run.properties.startedAt.pattern, CONTRACT_PATTERNS.rfc3339DateTime);
assert.equal(metrics.properties.run.properties.completedAt.pattern, CONTRACT_PATTERNS.rfc3339DateTime);
assert.equal(metrics.properties.run.properties.url.pattern, CONTRACT_PATTERNS.httpUrl);
assert.equal(metrics.$defs.evidence.properties.url.pattern, CONTRACT_PATTERNS.httpUrl);
assert.equal(metrics.properties.metrics.propertyNames.pattern, CONTRACT_PATTERNS.metricName);
assert.equal(metrics.$defs.metricValue.oneOf[1].propertyNames.pattern, CONTRACT_PATTERNS.metricName);
assertEnum(metrics.$defs.gate.properties.applicability.enum, APPLICABILITIES, "quality-metrics applicability");
assertEnum(metrics.$defs.gate.properties.status.enum, METRICS_GATE_STATUSES, "quality-metrics status");
assertEnum(metrics.properties.conclusion.enum, CONCLUSIONS, "quality-metrics conclusion");
assertEnum(metrics.$defs.evidence.properties.kind.enum, EVIDENCE_KINDS, "quality-metrics evidence kind");
assert.equal(metrics.$defs.evidence.properties.label.maxLength, CONTRACT_LIMITS.evidenceLabel);
assert.equal(metrics.$defs.gate.properties.label.maxLength, CONTRACT_LIMITS.gateLabel);
assert.equal(metrics.$defs.gate.properties.details.maxLength, CONTRACT_LIMITS.gateDetails);
assertGateRelations(metrics.$defs.gate, "quality-metrics gate");

assert.equal(history.properties.id.pattern, CONTRACT_PATTERNS.sha64);
assert.equal(history.properties.generatedAt.pattern, CONTRACT_PATTERNS.rfc3339DateTime);
assert.equal(history.$defs.quality.properties.validatedAt.pattern, CONTRACT_PATTERNS.rfc3339DateTime);
assert.equal(history.$defs.metricValue.oneOf[1].propertyNames.pattern, CONTRACT_PATTERNS.metricName);
assert.equal(history.$defs.quality.properties.metrics.propertyNames.pattern, CONTRACT_PATTERNS.metricName);
assertEnum(history.$defs.process.properties.overall.enum, PROCESS_STATUSES, "history process status");
assertEnum(history.$defs.quality.properties.status.enum, QUALITY_STATUSES, "history quality status");
assertEnum(history.$defs.quality.properties.conclusion.enum, CONCLUSIONS, "history conclusion");
assert.equal(history.$defs.gate.properties.id.maxLength, CONTRACT_LIMITS.historyGateId);
assert.equal(history.$defs.process.properties.checks.items.properties.id.maxLength, CONTRACT_LIMITS.historyCheckId);
assert.equal(history.$defs.repository.properties.id.maxLength, CONTRACT_LIMITS.historyRepositoryId);
assert.equal(history.$defs.repository.properties.repository.maxLength, CONTRACT_LIMITS.historyRepositoryName);
assert.equal(history.properties.standard.properties.release.maxLength, CONTRACT_LIMITS.standardRelease);
assert.equal(history.$defs.quality.properties.message.maxLength, CONTRACT_LIMITS.qualityMessage);
assert.equal(history.$defs.repository.properties.notApplicableAreas.items.maxLength, CONTRACT_LIMITS.notApplicableArea);
assertGateRelations(history.$defs.gate, "quality-history gate");

assert.equal(historyIndex.properties.generatedAt.pattern, CONTRACT_PATTERNS.rfc3339DateTime);
assert.equal(historyIndex.properties.snapshots.items.$ref, "quality-history.schema.json");

console.log("Schema-validator parity válido.");
