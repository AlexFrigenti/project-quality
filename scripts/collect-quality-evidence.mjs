import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { validateQualityMetrics } from "./validate-quality-metrics.mjs";

const API_ROOT = "https://api.github.com";
const execFileAsync = promisify(execFile);
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
    const response = await fetch(apiUrl(path), { headers });
    let data = null;
    try {
      data = await response.json();
    } catch {
      data = null;
    }
    return { ok: response.ok, status: response.status, data };
  } catch (error) {
    return {
      ok: false,
      status: 0,
      data: { message: error instanceof Error ? error.message : String(error) }
    };
  }
}

async function readArtifactJson(artifact, repository) {
  const archiveUrl = artifact.archive_download_url
    || apiUrl("/repos/" + repository + "/actions/artifacts/" + artifact.id + "/zip");
  const response = await fetch(archiveUrl, { headers });
  if (!response.ok) throw new Error("No se pudo descargar el artifact.");

  const bytes = Buffer.from(await response.arrayBuffer());
  if (bytes.length > 10 * 1024 * 1024) throw new Error("El artifact supera el límite de seguridad.");

  const temporaryDirectory = await mkdtemp(join(tmpdir(), "project-quality-artifact-"));
  const archivePath = join(temporaryDirectory, "quality-metrics.zip");
  await writeFile(archivePath, bytes);

  try {
    const listed = await execFileAsync("unzip", ["-Z1", archivePath], {
      encoding: "utf8",
      maxBuffer: 1000000
    });
    const entries = listed.stdout.trim().split(/\r?\n/).filter(Boolean);
    const reportPath = entries.find((entry) => entry === "quality-metrics.json" || entry.endsWith("/quality-metrics.json"));
    if (!reportPath) throw new Error("El artifact no contiene quality-metrics.json.");

    const extracted = await execFileAsync("unzip", ["-p", archivePath, reportPath], {
      encoding: "utf8",
      maxBuffer: 1000000
    });
    return JSON.parse(extracted.stdout);
  } finally {
    await rm(temporaryDirectory, { recursive: true, force: true });
  }
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
    sanitized[key] = sanitizeMetricValue(child, path + "." + key, {
      count: context.count,
      depth: context.depth + 1
    });
    context.count = context.count;
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

export async function collectQualityEvidence({
  repository,
  defaultBranch = "main",
  currentCommitSha,
  workflowFile = "quality.yml",
  exposeLinks = false
}) {
  if (!currentCommitSha) {
    return unavailableQualityEvidence("No se pudo resolver el HEAD actual de la rama estable.", currentCommitSha);
  }

  const runsPath = "/repos/" + repository + "/actions/workflows/" + encodeURIComponent(workflowFile)
    + "/runs?branch=" + encodeURIComponent(defaultBranch) + "&per_page=50";
  const runsResponse = await request(runsPath);
  if (!runsResponse.ok) {
    return unavailableQualityEvidence(
      "No se pudo consultar el historial de Actions.",
      currentCommitSha
    );
  }

  const candidates = (runsResponse.data?.workflow_runs || [])
    .filter((run) => run.status === "completed" && run.head_sha === currentCommitSha)
    .sort((left, right) => Date.parse(right.created_at || "") - Date.parse(left.created_at || ""));

  for (const run of candidates) {
    const artifactsResponse = await request("/repos/" + repository + "/actions/runs/" + run.id + "/artifacts?per_page=100");
    if (!artifactsResponse.ok) continue;

    const artifact = (artifactsResponse.data?.artifacts || [])
      .find((item) => item.name === "quality-metrics" && item.expired !== true);
    if (!artifact) continue;

    try {
      const parsed = await readArtifactJson(artifact, repository);
      if (parsed?.project?.repository !== repository) continue;
      const summary = buildQualitySummary(parsed, { exposeLinks });

      if (summary.commit.sha !== currentCommitSha) continue;
      if (summary.commit.branch !== defaultBranch) continue;
      if (summary.run.id !== run.id) continue;

      return {
        status: "current",
        message: "Evidencia correspondiente exactamente al HEAD actual de la rama estable.",
        currentCommitSha,
        validatedCommitSha: summary.commit.sha,
        artifact: {
          id: artifact.id,
          name: artifact.name,
          createdAt: artifact.created_at || null,
          expiresAt: artifact.expires_at || null
        },
        summary
      };
    } catch {
      // Un artifact inválido no se incorpora al dashboard.
    }
  }

  return pendingQualityEvidence(currentCommitSha);
}
