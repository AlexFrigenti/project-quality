import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { buildQualityHistorySnapshot, snapshotId } from "./persist-quality-history.mjs";
import { validateQualityHistory } from "./validate-quality-history.mjs";

const dashboardSha = "0123456789abcdef0123456789abcdef01234567";
const standardSha = "abcdefabcdefabcdefabcdefabcdefabcdefabcd";
const gestorSha = "1111111111111111111111111111111111111111";
const nexoSha = "2222222222222222222222222222222222222222";
const nucleoSha = "3333333333333333333333333333333333333333";

function currentReport({ id, repository, kind, visibility, sha, metrics, overall = "pass", governanceMechanism = "ruleset" }) {
  return {
    repository: { id, fullName: repository, visibility, defaultBranch: "main", headSha: sha },
    profile: { kind, notApplicableAreas: [] },
    overall,
    governance: { ruleset: { status: "pass", mechanism: governanceMechanism } },
    workflow: { status: "pass" },
    checks: [{ id: "main-protection", status: "pass" }],
    qualityEvidence: {
      status: "current",
      currentCommitSha: sha,
      validatedCommitSha: sha,
      summary: {
        conclusion: "passed",
        commit: { sha, branch: "main" },
        run: { completedAt: "2026-08-13T10:00:00.000Z" },
        gates: [{ id: "tests", label: "Tests", applicability: "required", status: "passed", details: "Gate ejecutado correctamente." }],
        metrics
      }
    }
  };
}

const data = {
  schemaVersion: 1,
  source: { commit: dashboardSha, standardRelease: "v1.1.0", standardSha },
  repositories: [
    currentReport({ id: "gestor-autonomo", repository: "AlexFrigenti/gestor-autonomo", kind: "node", visibility: "private", sha: gestorSha, metrics: { tests: { total: 10, passed: 10 }, coverage: { lines: 86.4 } } }),
    currentReport({ id: "nexo", repository: "AlexFrigenti/Nexo", kind: "node", visibility: "private", sha: nexoSha, metrics: { tests: { total: 8, passed: 8 } } }),
    currentReport({ id: "nucleo", repository: "AlexFrigenti/Nucleo", kind: "node", visibility: "public", sha: nucleoSha, metrics: {}, governanceMechanism: "branch-protection" }),
    {
      repository: { id: "nucleo-preview", fullName: "AlexFrigenti/Nucleo-preview", visibility: "public", headSha: "4444444444444444444444444444444444444444" },
      profile: { kind: "static", notApplicableAreas: ["Build", "Tipos"] },
      overall: "warning",
      governance: { ruleset: { status: "pass", mechanism: "ruleset" } },
      workflow: { status: "pass" },
      checks: [{ id: "latest-quality-run", status: "pending" }],
      qualityEvidence: { status: "pending", message: "Evidencia pendiente para el commit actual" }
    }
  ]
};

const first = buildQualityHistorySnapshot(data, { now: new Date("2026-08-13T10:05:00.000Z"), dashboardCommitSha: dashboardSha });
assert.ok(first);
validateQualityHistory(first);
assert.equal(first.repositories.length, 4);
assert.equal(first.repositories.find((repo) => repo.id === "nucleo-preview").quality.status, "pending");
assert.equal(first.repositories.find((repo) => repo.id === "gestor-autonomo").visibility, "private");
assert.equal(first.repositories.find((repo) => repo.id === "gestor-autonomo").quality.metrics.coverage.lines, 86.4);
assert.equal(first.repositories.find((repo) => repo.id === "nucleo").process.mainProtection, "pass");
assert.equal(first.repositories.find((repo) => repo.id === "nucleo").process.mechanism, undefined);
assert.equal(first.repositories.find((repo) => repo.id === "gestor-autonomo").quality.run, undefined);
assert.equal(/url|token|Bearer/i.test(JSON.stringify(first)), false);
assert.throws(() => validateQualityHistory({ ...first, unexpected: true }), /no está permitido/);
assert.throws(
  () => validateQualityHistory({ ...first, generatedAt: "2026-08-13" }),
  /generatedAt.*RFC3339/
);
assert.throws(
  () => validateQualityHistory({
    ...first,
    repositories: [{ ...first.repositories[0], id: "x".repeat(81) }, ...first.repositories.slice(1)]
  }),
  /repositories\[0\]\.id.*límite/
);
assert.throws(
  () => validateQualityHistory({
    ...first,
    repositories: [{ ...first.repositories[0], repository: "owner/" + "x".repeat(196) }, ...first.repositories.slice(1)]
  }),
  /repositories\[0\]\.repository.*límite/
);

const withUrlTextInDetails = structuredClone(first);
withUrlTextInDetails.repositories[0].quality.gates[0].details = "url: no requerida para el gate";
assert.doesNotThrow(() => validateQualityHistory(withUrlTextInDetails));

const withForbiddenUrlMetric = structuredClone(first);
withForbiddenUrlMetric.repositories[0].quality.metrics.url = 10;
assert.throws(() => validateQualityHistory(withForbiddenUrlMetric), /no puede contener URLs/);

const withHttpUrl = structuredClone(first);
withHttpUrl.repositories[0].quality.gates[0].details = "https://example.invalid";
assert.throws(() => validateQualityHistory(withHttpUrl), /no puede contener URLs/);

const withTokenInMetricKey = structuredClone(first);
withTokenInMetricKey.repositories[0].quality.metrics.ghp_secretToken = 10;
assert.throws(() => validateQualityHistory(withTokenInMetricKey), /patrón que parece un token/);

const rerun = buildQualityHistorySnapshot(data, { now: new Date("2026-08-13T11:05:00.000Z"), dashboardCommitSha: dashboardSha });
assert.equal(rerun.id, first.id);
assert.notEqual(rerun.generatedAt, first.generatedAt);

const mismatch = structuredClone(data);
mismatch.repositories[0].repository.headSha = "5555555555555555555555555555555555555555";
assert.throws(
  () => buildQualityHistorySnapshot(mismatch, { dashboardCommitSha: dashboardSha }),
  /no coincide exactamente/
);

const noCurrent = structuredClone(data);
for (const report of noCurrent.repositories) {
  report.qualityEvidence = { status: "pending", message: "Evidencia pendiente para el commit actual" };
}
assert.equal(buildQualityHistorySnapshot(noCurrent, { dashboardCommitSha: dashboardSha }), null);

const sampleGate = { id: "tests", label: "Tests", applicability: "required", status: "passed", details: "Gate ejecutado correctamente." };

const currentWithEmptyGates = structuredClone(first);
currentWithEmptyGates.repositories[0].quality.gates = [];
assert.throws(() => validateQualityHistory(currentWithEmptyGates), /actual debe contener al menos un gate/);

const pendingWithEmptyGates = structuredClone(first);
pendingWithEmptyGates.repositories[3].quality.status = "pending";
pendingWithEmptyGates.repositories[3].quality.gates = [];
assert.doesNotThrow(() => validateQualityHistory(pendingWithEmptyGates));

const pendingWithNonEmptyGates = structuredClone(first);
pendingWithNonEmptyGates.repositories[3].quality.status = "pending";
pendingWithNonEmptyGates.repositories[3].quality.gates = [sampleGate];
assert.throws(() => validateQualityHistory(pendingWithNonEmptyGates), /no puede contener gates en estado pending/);

const unavailableWithEmptyGates = structuredClone(first);
unavailableWithEmptyGates.repositories[3].quality.status = "unavailable";
unavailableWithEmptyGates.repositories[3].quality.message = "Evidencia no disponible";
unavailableWithEmptyGates.repositories[3].quality.gates = [];
assert.doesNotThrow(() => validateQualityHistory(unavailableWithEmptyGates));

const unavailableWithNonEmptyGates = structuredClone(first);
unavailableWithNonEmptyGates.repositories[3].quality.status = "unavailable";
unavailableWithNonEmptyGates.repositories[3].quality.message = "Evidencia no disponible";
unavailableWithNonEmptyGates.repositories[3].quality.gates = [sampleGate];
assert.throws(() => validateQualityHistory(unavailableWithNonEmptyGates), /no puede contener gates en estado unavailable/);

const schema = JSON.parse(await readFile("schemas/quality-history.schema.json", "utf8"));
assert.equal(schema.properties.schemaVersion.const, 1);
assert.ok(schema.$defs.quality.required.includes("gates"));
assert.equal(schema.$defs.quality.properties.gates.type, "array");
assert.equal("minItems" in schema.$defs.quality.properties.gates, false);
assert.equal(schema.properties.generatedAt.pattern, "^\\d{4}-\\d{2}-\\d{2}T\\d{2}:\\d{2}:\\d{2}(?:\\.\\d+)?(?:Z|[+-]\\d{2}:\\d{2})$");
assert.equal(schema.$defs.quality.properties.validatedAt.pattern, schema.properties.generatedAt.pattern);
assert.equal(schema.$defs.metricValue.oneOf[1].propertyNames.pattern, "^[a-zA-Z][a-zA-Z0-9_-]*$");
assert.equal(schema.$defs.quality.properties.metrics.propertyNames.pattern, "^[a-zA-Z][a-zA-Z0-9_-]*$");
assert.equal(schema.$defs.gate.properties.id.maxLength, 80);
assert.equal(schema.$defs.process.properties.checks.items.properties.id.maxLength, 80);
assert.equal(schema.$defs.repository.properties.id.maxLength, 80);

const gateNotApplicableRule = schema.$defs.gate.allOf.find(
  (rule) => rule.if?.properties?.applicability?.const === "not-applicable"
);
assert.equal(gateNotApplicableRule.then.properties.status.const, "not-applicable");
const gateApplicableRule = schema.$defs.gate.allOf.find(
  (rule) => rule.if?.properties?.applicability?.enum?.join(",") === "required,optional"
);
assert.equal(gateApplicableRule.then.properties.status.not.const, "not-applicable");

const currentCondition = schema.$defs.quality.allOf.find((cond) => cond.if?.properties?.status?.const === "current");
assert.ok(currentCondition);
assert.equal(currentCondition.then?.properties?.gates?.minItems, 1);

const nonCurrentCondition = schema.$defs.quality.allOf.find((cond) => cond.if?.properties?.status?.enum?.includes("pending"));
assert.ok(nonCurrentCondition);
assert.equal(nonCurrentCondition.then?.properties?.gates?.maxItems, 0);

assert.deepEqual(schema.properties.identityVersion, { enum: [1, 2] });
assert.equal(schema.required.includes("identityVersion"), false);

const mutateSnapshot = (mutate) => {
  const snapshot = structuredClone(first);
  mutate(snapshot);
  snapshot.id = snapshotId(snapshot);
  return snapshot;
};

assert.equal(first.identityVersion, 2);
assert.equal(mutateSnapshot((s) => { s.generatedAt = "2026-08-13T23:59:00.000Z"; }).id, first.id);
assert.equal(mutateSnapshot((s) => { s.dashboardCommitSha = "9".repeat(40); }).id, first.id);
assert.equal(mutateSnapshot((s) => { s.repositories[0].quality.validatedAt = "2026-08-13T09:00:00.000Z"; }).id, first.id);
assert.equal(mutateSnapshot((s) => { s.repositories[3].quality.message = "Causa transitoria distinta"; }).id, first.id);
assert.equal(mutateSnapshot((s) => { s.repositories[0].quality.gates[0].details = "Detalle textual alternativo"; }).id, first.id);
assert.equal(mutateSnapshot((s) => { s.repositories[0].quality.gates[0].label = "Tests unitarios"; }).id, first.id);

assert.notEqual(mutateSnapshot((s) => { s.repositories[0].quality.commitSha = gestorSha.slice(1) + "2"; }).id, first.id);
assert.notEqual(mutateSnapshot((s) => { s.repositories[0].process.overall = "warning"; }).id, first.id);
assert.notEqual(mutateSnapshot((s) => { s.repositories[0].quality.gates[0].status = "skipped"; }).id, first.id);
assert.notEqual(mutateSnapshot((s) => { s.repositories[0].quality.gates[0].applicability = "optional"; }).id, first.id);
assert.notEqual(mutateSnapshot((s) => { s.repositories[0].quality.metrics.tests.passed = 9; }).id, first.id);

const legacyRecipeFor = (snapshot) => ({
  schemaVersion: snapshot.schemaVersion,
  standard: snapshot.standard,
  repositories: snapshot.repositories.map((repository) => ({
    id: repository.id,
    repository: repository.repository,
    process: repository.process,
    quality: repository.quality
  }))
});
const legacyExpectedId = createHash("sha256").update(JSON.stringify(legacyRecipeFor(first))).digest("hex");
const legacySnapshot = structuredClone(first);
delete legacySnapshot.identityVersion;
delete legacySnapshot.id;
assert.equal(snapshotId(legacySnapshot), legacyExpectedId);
legacySnapshot.id = legacyExpectedId;
assert.doesNotThrow(() => validateQualityHistory(legacySnapshot));
assert.notEqual(first.id, legacyExpectedId);

assert.throws(() => snapshotId({ ...structuredClone(first), identityVersion: 3 }), /identityVersion/);
assert.throws(() => validateQualityHistory({ ...structuredClone(first), identityVersion: 3 }), /identityVersion/);

console.log("Histórico de calidad válido.");
