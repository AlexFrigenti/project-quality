import assert from "node:assert/strict";
import { buildQualityHistorySnapshot } from "./persist-quality-history.mjs";
import { validateQualityHistory } from "./validate-quality-history.mjs";

const dashboardSha = "0123456789abcdef0123456789abcdef01234567";
const standardSha = "abcdefabcdefabcdefabcdefabcdefabcdefabcd";
const gestorSha = "1111111111111111111111111111111111111111";
const nexoSha = "2222222222222222222222222222222222222222";
const nucleoSha = "3333333333333333333333333333333333333333";

function currentReport({ id, repository, kind, visibility, sha, metrics, overall = "pass" }) {
  return {
    repository: { id, fullName: repository, visibility, defaultBranch: "main", headSha: sha },
    profile: { kind, notApplicableAreas: [] },
    overall,
    governance: { ruleset: { status: "pass" } },
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
    currentReport({ id: "nucleo", repository: "AlexFrigenti/Nucleo", kind: "node", visibility: "public", sha: nucleoSha, metrics: {} }),
    {
      repository: { id: "nucleo-preview", fullName: "AlexFrigenti/Nucleo-preview", visibility: "public", headSha: "4444444444444444444444444444444444444444" },
      profile: { kind: "static", notApplicableAreas: ["Build", "Tipos"] },
      overall: "warning",
      governance: { ruleset: { status: "pass" } },
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
assert.equal(first.repositories.find((repo) => repo.id === "gestor-autonomo").quality.run, undefined);
assert.equal(/url|token|Bearer/i.test(JSON.stringify(first)), false);
assert.throws(() => validateQualityHistory({ ...first, unexpected: true }), /no está permitido/);

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

console.log("Histórico de calidad válido.");
