import assert from "node:assert/strict";
import {
  buildQualitySummary,
  collectQualityEvidence,
  pendingQualityEvidence,
  readArtifactJson,
  sanitizeQualityMetrics
} from "./collect-quality-evidence.mjs";

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
  ]
};

const sanitized = sanitizeQualityMetrics(sample);
assert.equal(sanitized.schemaVersion, 1);
assert.equal(sanitized.commit.sha, sample.commit.sha);
assert.deepEqual(sanitized.metrics, sample.metrics);
assert.throws(() => sanitizeQualityMetrics({ ...sample, unexpected: "invalido" }), /report\.unexpected no está permitido/);

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

const REPOSITORY = "AlexFrigenti/example";
const CURRENT_SHA = sample.commit.sha;

function reportFor({ id = 123, attempt = 1, conclusion = "passed", sha = CURRENT_SHA } = {}) {
  const report = structuredClone(sample);
  report.run = { ...report.run, id, attempt };
  report.conclusion = conclusion;
  report.commit = { ...report.commit, sha };
  return report;
}

function runFor({ id, conclusion = "success", attempt = 1, sha = CURRENT_SHA, status = "completed", createdAt }) {
  return {
    id,
    status,
    head_sha: sha,
    conclusion,
    run_attempt: attempt,
    created_at: createdAt || "2026-08-13T10:0" + (id % 10) + ":00.000Z"
  };
}

function artifactFor(id) {
  return {
    id,
    name: "quality-metrics",
    expired: false,
    created_at: "2026-08-13T10:05:00.000Z",
    expires_at: "2026-09-12T10:05:00.000Z"
  };
}

function stubFetch({ runs = [], runsOk = true, artifactsByRun = {}, artifactsOkByRun = {} } = {}) {
  return async (path) => {
    if (path.includes("/actions/workflows/") && path.includes("/runs?")) {
      return { ok: runsOk, status: runsOk ? 200 : 500, data: runsOk ? { workflow_runs: runs } : {} };
    }
    const match = path.match(/\/actions\/runs\/(\d+)\/artifacts/);
    if (match) {
      const runId = Number(match[1]);
      if (artifactsOkByRun[runId] === false) return { ok: false, status: 500, data: {} };
      return { ok: true, status: 200, data: { artifacts: artifactsByRun[runId] || [] } };
    }
    return { ok: false, status: 404, data: {} };
  };
}

function stubReadArtifact(byArtifactId = {}) {
  return async (artifact) => {
    const entry = byArtifactId[artifact.id];
    if (entry instanceof Error) throw entry;
    return entry;
  };
}

function collectWith({ runs, artifactsByRun, readByArtifactId, runsOk, artifactsOkByRun } = {}) {
  return collectQualityEvidence({
    repository: REPOSITORY,
    defaultBranch: "main",
    currentCommitSha: CURRENT_SHA,
    workflowFile: "quality.yml",
    exposeLinks: false,
    deps: {
      fetch: stubFetch({ runs, runsOk, artifactsByRun, artifactsOkByRun }),
      readArtifact: stubReadArtifact(readByArtifactId)
    }
  });
}

{
  const result = await collectWith({
    runs: [runFor({ id: 123, conclusion: "success", attempt: 1 })],
    artifactsByRun: { 123: [artifactFor(900)] },
    readByArtifactId: { 900: reportFor({ id: 123, attempt: 1, conclusion: "passed" }) }
  });
  assert.equal(result.status, "current");
  assert.equal(result.validatedCommitSha, CURRENT_SHA);
  assert.equal(result.summary.conclusion, "passed");
  assert.equal(result.summary.run.id, 123);
  assert.equal(result.artifact.id, 900);
}

{
  const result = await collectWith({
    runs: [runFor({ id: 124, conclusion: "failure", attempt: 1 })],
    artifactsByRun: { 124: [artifactFor(901)] },
    readByArtifactId: { 901: reportFor({ id: 124, conclusion: "failed" }) }
  });
  assert.equal(result.status, "current");
  assert.equal(result.summary.conclusion, "failed");
}

for (const [conclusion, expectedPattern] of [
  ["failure", /contradice la conclusión real de la ejecución \(failure\)/],
  ["cancelled", /terminó con conclusión cancelled y no constituye evidencia válida/]
]) {
  const result = await collectWith({
    runs: [runFor({ id: 125, conclusion, attempt: 1 })],
    artifactsByRun: { 125: [artifactFor(902)] },
    readByArtifactId: { 902: reportFor({ id: 125, conclusion: "passed" }) }
  });
  assert.equal(result.status, "unavailable");
  assert.equal(result.validatedCommitSha, null);
  assert.equal(result.summary, null);
  assert.match(result.message, new RegExp("^Evidencia candidata no utilizable"));
  assert.match(result.message, expectedPattern);
}

{
  const result = await collectWith({
    runs: [runFor({ id: 126, conclusion: "timed_out", attempt: 1 })],
    artifactsByRun: { 126: [artifactFor(903)] },
    readByArtifactId: { 903: reportFor({ id: 126, conclusion: "failed" }) }
  });
  assert.equal(result.status, "unavailable");
  assert.match(result.message, /terminó con conclusión timed_out/);
}

{
  const result = await collectWith({
    runs: [runFor({ id: 127, conclusion: "success", attempt: 2 })],
    artifactsByRun: { 127: [artifactFor(904)] },
    readByArtifactId: { 904: reportFor({ id: 127, attempt: 1, conclusion: "passed" }) }
  });
  assert.equal(result.status, "unavailable");
  assert.match(result.message, /intento 1 pero la ejecución terminó en el intento 2/);
}

{
  const newer = runFor({ id: 200, conclusion: "success", attempt: 1, createdAt: "2026-08-13T11:00:00.000Z" });
  const older = runFor({ id: 100, conclusion: "success", attempt: 1, createdAt: "2026-08-13T10:00:00.000Z" });
  const result = await collectWith({
    runs: [older, newer],
    artifactsByRun: { 200: [artifactFor(905)], 100: [artifactFor(906)] },
    readByArtifactId: {
      905: reportFor({ id: 200, conclusion: "passed" }),
      906: reportFor({ id: 100, conclusion: "passed" })
    }
  });
  assert.equal(result.status, "current");
  assert.equal(result.summary.run.id, 200);
  assert.equal(result.artifact.id, 905);
}

{
  const contradicted = runFor({ id: 300, conclusion: "failure", attempt: 1, createdAt: "2026-08-13T11:00:00.000Z" });
  const olderValid = runFor({ id: 100, conclusion: "success", attempt: 1, createdAt: "2026-08-13T10:00:00.000Z" });
  const result = await collectWith({
    runs: [contradicted, olderValid],
    artifactsByRun: { 300: [artifactFor(907)], 100: [artifactFor(908)] },
    readByArtifactId: {
      907: reportFor({ id: 300, conclusion: "passed" }),
      908: reportFor({ id: 100, conclusion: "passed" })
    }
  });
  assert.equal(result.status, "unavailable");
  assert.equal(result.summary, null);
  assert.match(result.message, /contradice la conclusión real de la ejecución \(failure\)/);
}

{
  const cancelled = runFor({ id: 301, conclusion: "cancelled", attempt: 1, createdAt: "2026-08-13T11:00:00.000Z" });
  const olderValid = runFor({ id: 100, conclusion: "success", attempt: 1, createdAt: "2026-08-13T10:00:00.000Z" });
  const result = await collectWith({
    runs: [cancelled, olderValid],
    artifactsByRun: { 301: [artifactFor(914)], 100: [artifactFor(908)] },
    readByArtifactId: {
      914: reportFor({ id: 301, conclusion: "passed" }),
      908: reportFor({ id: 100, conclusion: "passed" })
    }
  });
  assert.equal(result.status, "unavailable");
  assert.match(result.message, /terminó con conclusión cancelled/);
}

{
  const withoutArtifact = runFor({ id: 302, conclusion: "success", attempt: 1, createdAt: "2026-08-13T11:00:00.000Z" });
  const olderValid = runFor({ id: 100, conclusion: "success", attempt: 1, createdAt: "2026-08-13T10:00:00.000Z" });
  const result = await collectWith({
    runs: [withoutArtifact, olderValid],
    artifactsByRun: { 302: [], 100: [artifactFor(908)] },
    readByArtifactId: { 908: reportFor({ id: 100, conclusion: "passed" }) }
  });
  assert.equal(result.status, "unavailable");
  assert.match(result.message, /no tiene un artifact quality-metrics disponible/);
}

for (const [label, broken] of [
  ["descarga", new Error("No se pudo descargar el artifact.")],
  ["zip sin informe", new Error("El artifact no contiene quality-metrics.json.")],
  ["json corrupto", new SyntaxError("Unexpected token < in JSON at position 0")]
]) {
  const result = await collectWith({
    runs: [runFor({ id: 128 })],
    artifactsByRun: { 128: [artifactFor(909)] },
    readByArtifactId: { 909: broken }
  });
  assert.equal(result.status, "unavailable", label);
  assert.equal(result.status !== "pending", true, label);
  assert.match(result.message, /el artifact no pudo leerse \(/);
}

{
  const invalidReport = reportFor({ id: 129 });
  invalidReport.gates[0].status = "bogus";
  const result = await collectWith({
    runs: [runFor({ id: 129 })],
    artifactsByRun: { 129: [artifactFor(910)] },
    readByArtifactId: { 910: invalidReport }
  });
  assert.equal(result.status, "unavailable");
  assert.match(result.message, /el informe viola el contrato \(gates\[0\]\.status no es válido\)/);
}

{
  const result = await collectWith({
    runs: [runFor({ id: 130 })],
    artifactsByRun: { 130: [] }
  });
  assert.equal(result.status, "unavailable");
  assert.match(result.message, /no tiene un artifact quality-metrics disponible/);
}

{
  const result = await collectWith({
    runs: [runFor({ id: 131 })],
    artifactsByRun: { 131: [artifactFor(911)] },
    artifactsOkByRun: { 131: false }
  });
  assert.equal(result.status, "unavailable");
  assert.match(result.message, /no se pudieron consultar los artifacts/);
}

{
  const broken = runFor({ id: 303, conclusion: "success", attempt: 1, createdAt: "2026-08-13T11:00:00.000Z" });
  const olderValid = runFor({ id: 100, conclusion: "success", attempt: 1, createdAt: "2026-08-13T10:00:00.000Z" });
  const result = await collectWith({
    runs: [broken, olderValid],
    artifactsByRun: { 303: [artifactFor(912)], 100: [artifactFor(913)] },
    readByArtifactId: {
      912: new Error("No se pudo descargar el artifact."),
      913: reportFor({ id: 100, conclusion: "passed" })
    }
  });
  assert.equal(result.status, "unavailable");
  assert.equal(result.summary, null);
  assert.match(result.message, /el artifact no pudo leerse \(No se pudo descargar el artifact\.\)/);
}

{
  const result = await collectWith({
    runs: [
      runFor({ id: 140, status: "in_progress", conclusion: null }),
      runFor({ id: 141, sha: "1111111111111111111111111111111111111111" })
    ],
    artifactsByRun: {}
  });
  assert.equal(result.status, "pending");
  assert.equal(result.message, "Evidencia pendiente para el commit actual");
}

{
  const result = await collectWith({ runs: [], runsOk: false });
  assert.equal(result.status, "unavailable");
  assert.equal(result.message, "No se pudo consultar el historial de Actions.");
}

await assert.rejects(
  readArtifactJson({ id: 1 }, REPOSITORY, { fetch: async () => ({ ok: false, status: 403 }) }),
  /No se pudo descargar el artifact/
);

await assert.rejects(
  readArtifactJson(
    { id: 2 },
    REPOSITORY,
    { fetch: async () => ({ ok: true, status: 200, arrayBuffer: async () => Buffer.alloc(10 * 1024 * 1024 + 1) }) }
  ),
  /supera el límite/
);

assert.throws(() => sanitizeQualityMetrics({
  ...sample,
  evidence: [{
    kind: "workflow-run",
    label: "Ejecución",
    url: "https://github.com/example?token=github_pat_fake"
  }]
}), /token/i);

console.log("Collector de evidencia válido.");
