import { readFile } from "node:fs/promises";
import { pathToFileURL } from "node:url";
import { resolve } from "node:path";
import { validateQualityMetrics } from "./validate-quality-metrics.mjs";
import { findZipEntry } from "./zip-entry-reader.mjs";
import { resilientFetch, withRetry } from "./github-api-request.mjs";

const ENTRY_NAME = "quality-metrics.json";

const API_ROOT = "https://api.github.com";
const token = process.env.AUDIT_TOKEN || process.env.GITHUB_TOKEN || "";
const headers = {
  Accept: "application/vnd.github+json",
  "X-GitHub-Api-Version": "2022-11-28",
  "User-Agent": "project-quality-quality-dashboard"
};
if (token) headers.Authorization = "Bearer " + token;

function apiUrl(path) {
  return path.startsWith("http") ? path : API_ROOT + path;
}

async function request(path) {
  try {
    const response = await resilientFetch(apiUrl(path), { headers });
    let data = response.data;
    if (data === undefined) {
      try {
        data = await response.json();
      } catch {
        data = null;
      }
    }
    return { ok: response.ok, status: response.status, data };
  } catch (error) {
    return {
      ok: false,
      status: 0,
      data: { message: String(error instanceof Error ? error.message : error).slice(0, 200) }
    };
  }
}

export async function readArtifactJson(artifact, repository, deps = {}) {
  const fetchImpl = deps.fetch || fetch;
  const resilientDeps = {
    fetch: fetchImpl,
    sleep: deps.sleep,
    now: deps.now,
    config: deps.config
  };
  const archiveUrl = artifact.archive_download_url
    || apiUrl("/repos/" + repository + "/actions/artifacts/" + artifact.id + "/zip");
  const response = await resilientFetch(archiveUrl, { headers }, resilientDeps);
  if (!response.ok) throw new Error("No se pudo descargar el artifact.");

  const bytes = Buffer.from(await response.arrayBuffer());
  if (bytes.length > 10 * 1024 * 1024) throw new Error("El artifact supera el límite de seguridad.");

  const entry = findZipEntry(bytes, (name) => name === ENTRY_NAME || name.endsWith("/" + ENTRY_NAME));
  if (!entry) throw new Error(`El artifact no contiene ${ENTRY_NAME}.`);

  return JSON.parse(entry.data.toString("utf8"));
}

function boundedText(value, maxLength) {
  return String(value).slice(0, maxLength);
}

function sanitizeMetricValue(value, path, context = { count: 0, depth: 0 }) {
  context.count += 1;
  if (context.count > 100) throw new Error("El informe contiene demasiados valores métricos.");
  if (context.depth > 6) throw new Error("La métrica está anidada más allá del límite permitido.");

  if (typeof value === "number") {
    if (!Number.isFinite(value) || value < 0) throw new Error("Métrica inválida en " + path);
    return value;
  }

  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    throw new Error("Métrica no numérica en " + path);
  }

  const entries = Object.entries(value);
  if (entries.length === 0) throw new Error("Métrica vacía en " + path);

  const sanitized = {};
  for (const [key, child] of entries) {
    if (!/^[a-zA-Z][a-zA-Z0-9_-]*$/.test(key)) throw new Error("Nombre de métrica inválido en " + path);
    context.depth += 1;
    sanitized[key] = sanitizeMetricValue(child, path + "." + key, context);
    context.depth -= 1;
  }
  return sanitized;
}

function sanitizeEvidenceList(items, exposeLinks) {
  return items.map((item) => {
    const evidence = {
      kind: item.kind,
      label: boundedText(item.label, 160)
    };
    if (exposeLinks) evidence.url = item.url;
    return evidence;
  });
}

function sanitizeMetrics(metrics) {
  const context = { count: 0, depth: 0 };
  return Object.fromEntries(
    Object.entries(metrics).map(([key, value]) => [key, sanitizeMetricValue(value, key, context)])
  );
}

export function sanitizeQualityMetrics(report) {
  validateQualityMetrics(report);

  return {
    schemaVersion: report.schemaVersion,
    project: {
      id: report.project.id,
      name: boundedText(report.project.name, 120),
      repository: report.project.repository,
      kind: report.project.kind
    },
    commit: {
      sha: report.commit.sha,
      ref: report.commit.ref,
      branch: report.commit.branch,
      event: report.commit.event
    },
    run: {
      workflow: boundedText(report.run.workflow, 160),
      id: report.run.id,
      attempt: report.run.attempt,
      startedAt: report.run.startedAt,
      completedAt: report.run.completedAt,
      url: report.run.url
    },
    standard: {
      version: report.standard.version,
      sha: report.standard.sha
    },
    conclusion: report.conclusion,
    gates: report.gates.map((gate) => ({
      id: gate.id,
      label: boundedText(gate.label, 160),
      applicability: gate.applicability,
      status: gate.status,
      details: boundedText(gate.details, 400),
      evidence: sanitizeEvidenceList(gate.evidence, true)
    })),
    metrics: sanitizeMetrics(report.metrics),
    evidence: sanitizeEvidenceList(report.evidence, true)
  };
}

export function buildQualitySummary(report, { exposeLinks = false } = {}) {
  validateQualityMetrics(report);

  const summary = {
    conclusion: report.conclusion,
    commit: {
      sha: report.commit.sha,
      ref: report.commit.ref,
      branch: report.commit.branch,
      event: report.commit.event
    },
    run: {
      workflow: boundedText(report.run.workflow, 160),
      id: report.run.id,
      attempt: report.run.attempt,
      startedAt: report.run.startedAt,
      completedAt: report.run.completedAt
    },
    standard: {
      version: report.standard.version,
      sha: report.standard.sha
    },
    gates: report.gates.map((gate) => ({
      id: gate.id,
      label: boundedText(gate.label, 160),
      applicability: gate.applicability,
      status: gate.status,
      details: boundedText(gate.details, 400),
      evidence: sanitizeEvidenceList(gate.evidence, exposeLinks)
    })),
    metrics: sanitizeMetrics(report.metrics)
  };

  if (exposeLinks) {
    summary.run.url = report.run.url;
    summary.evidence = sanitizeEvidenceList(report.evidence, true);
  }

  return summary;
}

export function pendingQualityEvidence(currentCommitSha) {
  return {
    status: "pending",
    message: "Evidencia pendiente para el commit actual",
    currentCommitSha: currentCommitSha || null,
    validatedCommitSha: null,
    artifact: null,
    summary: null
  };
}

function unavailableQualityEvidence(message, currentCommitSha) {
  return {
    status: "unavailable",
    message,
    currentCommitSha: currentCommitSha || null,
    validatedCommitSha: null,
    artifact: null,
    summary: null
  };
}

const RUN_CONCLUSION_CONCLUSIONS = new Map([
  ["success", "passed"],
  ["failure", "failed"]
]);

function candidateRejection(summary, run, { defaultBranch, currentCommitSha }) {
  if (summary.commit.sha !== currentCommitSha) return "un informe corresponde a otro commit";
  if (summary.commit.branch !== defaultBranch) return "un informe no pertenece a la rama estable";
  if (summary.run.id !== run.id) return "un informe corresponde a otra ejecución";
  if (summary.run.attempt !== run.run_attempt) {
    return "un informe corresponde al intento " + summary.run.attempt + " pero la ejecución terminó en el intento " + run.run_attempt;
  }
  const expected = RUN_CONCLUSION_CONCLUSIONS.get(run.conclusion);
  if (!expected) {
    return "la ejecución terminó con conclusión " + (run.conclusion || "sin conclusión") + " y no constituye evidencia válida";
  }
  if (summary.conclusion !== expected) {
    return "la conclusión del informe (" + summary.conclusion + ") contradice la conclusión real de la ejecución (" + run.conclusion + ")";
  }
  return null;
}

async function evaluateLatestRun(run, { repository, defaultBranch, currentCommitSha, exposeLinks, fetchImpl, readArtifact }) {
  const allArtifacts = [];
  for (let page = 1; page <= 100; page += 1) {
    const artifactsPath = "/repos/" + repository + "/actions/runs/" + run.id + "/artifacts?per_page=100&page=" + page;
    const artifactsResponse = await fetchImpl(artifactsPath);
    if (!artifactsResponse.ok) {
      return { cause: "no se pudo completar la paginación de artifacts de la ejecución más reciente del commit actual. La paginación quedó incompleta. (página " + page + ")" };
    }
    const batch = artifactsResponse.data?.artifacts;
    if (!Array.isArray(batch)) {
      return { cause: "la respuesta de artifacts no es válida y la paginación quedó incompleta. (página " + page + ")" };
    }
    allArtifacts.push(...batch);
    if (batch.length < 100) break;
    if (page === 100) {
      return { cause: "se alcanzó el límite de 100 páginas al paginar artifacts; la paginación quedó incompleta" };
    }
  }

  const artifact = allArtifacts.find((item) => item.name === "quality-metrics" && item.expired !== true);
  if (!artifact) {
    return { cause: "la ejecución más reciente del commit actual no tiene un artifact quality-metrics disponible" };
  }

  let parsed;
  try {
    parsed = await readArtifact(artifact, repository);
  } catch (error) {
    return { cause: "el artifact no pudo leerse (" + boundedText(error instanceof Error ? error.message : String(error), 120) + ")" };
  }

  if (parsed?.project?.repository !== repository) {
    return { cause: "el artifact pertenece a otro repositorio" };
  }

  let summary;
  try {
    summary = buildQualitySummary(parsed, { exposeLinks });
  } catch (error) {
    return { cause: "el informe viola el contrato (" + boundedText(error instanceof Error ? error.message : String(error), 120) + ")" };
  }

  const rejection = candidateRejection(summary, run, { defaultBranch, currentCommitSha });
  if (rejection) return { cause: rejection };

  return { artifact, summary };
}

export async function collectQualityEvidence({
  repository,
  defaultBranch = "main",
  currentCommitSha,
  workflowFile = "quality.yml",
  exposeLinks = false,
  deps = {}
} = {}) {
  const resilientDeps = {
    fetch: deps.fetch || globalThis.fetch,
    sleep: deps.sleep,
    now: deps.now,
    config: deps.config
  };
  const fetchImpl = async (path) => {
    const operation = async () => {
      if (deps.fetch) {
        const result = await deps.fetch(path);
        if (!result.headers) result.headers = { get: () => null, has: () => false };
        return result;
      }
      const response = await resilientFetch(apiUrl(path), { headers }, resilientDeps);
      let data = response.data;
      if (data === undefined) {
        try {
          data = await response.json();
        } catch {
          data = null;
        }
      }
      return { ok: response.ok, status: response.status, headers: response.headers, data };
    };
    return withRetry(operation, resilientDeps);
  };
  const readArtifact = deps.readArtifact || ((artifact, targetRepository) => readArtifactJson(artifact, targetRepository, deps));

  if (!currentCommitSha) {
    return unavailableQualityEvidence("No se pudo resolver el HEAD actual de la rama estable.", currentCommitSha);
  }

  const allRuns = [];
  for (let page = 1; page <= 100; page += 1) {
    const runsPath = "/repos/" + repository + "/actions/workflows/" + encodeURIComponent(workflowFile)
      + "/runs?branch=" + encodeURIComponent(defaultBranch) + "&per_page=100&page=" + page;
    const runsResponse = await fetchImpl(runsPath);
    if (!runsResponse.ok) {
      return unavailableQualityEvidence(
        "No se pudo completar la paginación del historial de Actions. La paginación quedó incompleta. (página " + page + ", HTTP " + runsResponse.status + ")",
        currentCommitSha
      );
    }
    const batch = runsResponse.data?.workflow_runs;
    if (!Array.isArray(batch)) {
      return unavailableQualityEvidence(
        "La respuesta de workflow runs no es válida y la paginación quedó incompleta. (página " + page + ")",
        currentCommitSha
      );
    }
    allRuns.push(...batch);
    if (batch.length < 100) break;
    if (page === 100) {
      return unavailableQualityEvidence(
        "Se alcanzó el límite de 100 páginas al paginar workflow runs; la paginación quedó incompleta.",
        currentCommitSha
      );
    }
  }

  const candidates = allRuns
    .filter((run) => run.status === "completed" && run.head_sha === currentCommitSha)
    .sort((left, right) => Date.parse(right.created_at || "") - Date.parse(left.created_at || ""));

  const latestRun = candidates[0];
  if (!latestRun) {
    return pendingQualityEvidence(currentCommitSha);
  }

  const outcome = await evaluateLatestRun(latestRun, {
    repository,
    defaultBranch,
    currentCommitSha,
    exposeLinks,
    fetchImpl,
    readArtifact
  });

  if (outcome.summary) {
    const artifact = outcome.artifact;
    return {
      status: "current",
      message: "Evidencia correspondiente exactamente al HEAD actual de la rama estable.",
      currentCommitSha,
      validatedCommitSha: outcome.summary.commit.sha,
      artifact: {
        id: artifact.id,
        name: artifact.name,
        createdAt: artifact.created_at || null,
        expiresAt: artifact.expires_at || null
      },
      summary: outcome.summary
    };
  }

  return unavailableQualityEvidence(
    boundedText("Evidencia candidata no utilizable para el commit actual: " + outcome.cause + ".", 200),
    currentCommitSha
  );
}
