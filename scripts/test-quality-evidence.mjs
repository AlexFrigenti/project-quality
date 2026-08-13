import assert from "node:assert/strict";
import { buildQualitySummary, pendingQualityEvidence, sanitizeQualityMetrics } from "./collect-quality-evidence.mjs";

const sample = {
  schemaVersion: 1,
  project: {
    id: "example",
    name: "Example",
    repository: "AlexFrigenti/example",
    kind: "static"
  },
  commit: {
    sha: "0123456789abcdef0123456789abcdef01234567",
    ref: "refs/heads/main",
    branch: "main",
    event: "push"
  },
  run: {
    workflow: "Quality checks",
    id: 123,
    attempt: 1,
    startedAt: "2026-08-13T10:00:00.000Z",
    completedAt: "2026-08-13T10:01:00.000Z",
    url: "https://github.com/AlexFrigenti/example/actions/runs/123"
  },
  standard: {
    version: "v1.1.0",
    sha: "abcdefabcdefabcdefabcdefabcdefabcdefabcd"
  },
  conclusion: "passed",
  gates: [
    {
      id: "validation",
      label: "Validación estática",
      applicability: "required",
      status: "passed",
      details: "Gate ejecutado correctamente.",
      evidence: [
        {
          kind: "workflow-run",
          label: "Ejecución del workflow de calidad",
          url: "https://github.com/AlexFrigenti/example/actions/runs/123"
        }
      ]
    },
    {
      id: "coverage",
      label: "Cobertura",
      applicability: "not-applicable",
      status: "not-applicable",
      details: "No aplica para este perfil.",
      evidence: [
        {
          kind: "workflow-run",
          label: "Ejecución del workflow de calidad",
          url: "https://github.com/AlexFrigenti/example/actions/runs/123"
        }
      ]
    }
  ],
  metrics: {
    tests: { total: 12, passed: 12 },
    coverage: { lines: 86.4 }
  },
  evidence: [
    {
      kind: "workflow-run",
      label: "Ejecución del workflow de calidad",
      url: "https://github.com/AlexFrigenti/example/actions/runs/123"
    }
  ],
  unexpected: "this field is deliberately removed"
};

const sanitized = sanitizeQualityMetrics(sample);
assert.equal(sanitized.schemaVersion, 1);
assert.equal(sanitized.commit.sha, sample.commit.sha);
assert.deepEqual(sanitized.metrics, sample.metrics);
assert.equal("unexpected" in sanitized, false);

const publicSummary = buildQualitySummary(sample, { exposeLinks: true });
assert.equal(publicSummary.run.url, sample.run.url);
assert.equal(publicSummary.gates[0].evidence[0].url, sample.evidence[0].url);

const privateSummary = buildQualitySummary(sample);
assert.equal("url" in privateSummary.run, false);
assert.equal("url" in privateSummary.gates[0].evidence[0], false);
assert.equal("evidence" in privateSummary, false);
assert.deepEqual(privateSummary.metrics, sample.metrics);

const pending = pendingQualityEvidence(sample.commit.sha);
assert.equal(pending.status, "pending");
assert.equal(pending.message, "Evidencia pendiente para el commit actual");
assert.equal(pending.currentCommitSha, sample.commit.sha);
assert.equal(pending.validatedCommitSha, null);
assert.equal(pending.summary, null);

assert.throws(() => sanitizeQualityMetrics({
  ...sample,
  evidence: [{
    kind: "workflow-run",
    label: "Ejecución",
    url: "https://github.com/example?token=github_pat_fake"
  }]
}), /token/i);

console.log("Collector de evidencia válido.");
