import assert from "node:assert/strict";
import { pendingQualityEvidence, sanitizeQualityMetrics } from "./collect-quality-evidence.mjs";

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
    checks: { total: 4 }
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
assert.deepEqual(sanitized.metrics, { checks: { total: 4 } });
assert.equal("unexpected" in sanitized, false);
assert.equal(sanitized.gates[1].status, "not-applicable");

const pending = pendingQualityEvidence(sample.commit.sha);
assert.equal(pending.status, "pending");
assert.equal(pending.message, "Evidencia pendiente para el commit actual");
assert.equal(pending.currentCommitSha, sample.commit.sha);
assert.equal(pending.validatedCommitSha, null);

assert.throws(() => sanitizeQualityMetrics({
  ...sample,
  evidence: [{
    kind: "workflow-run",
    label: "Ejecución",
    url: "https://github.com/example?token=github_pat_fake"
  }]
}), /token/i);

console.log("Collector de evidencia válido.");
