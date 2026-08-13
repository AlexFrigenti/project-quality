import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { pathToFileURL } from "node:url";
import { resolve } from "node:path";
import { validateQualityHistory } from "./validate-quality-history.mjs";

const API_ROOT = "https://api.github.com";
const TOKEN_PATTERN = /(gh[pousr]_[A-Za-z0-9_]+|github_pat_[A-Za-z0-9_]+|Bearer\s+[A-Za-z0-9._-]+)/i;
const PROCESS_STATUSES = new Set(["pass", "warning", "fail", "unknown", "pending", "missing", "not_applicable"]);
const QUALITY_STATUSES = new Set(["current", "pending", "unavailable"]);

function requireText(value, name) {
  if (typeof value !== "string" || value.trim() === "") throw new Error(name + " es obligatorio.");
  return value.trim();
}

function requireSha(value, name) {
  const result = requireText(value, name);
  if (!/^[0-9a-f]{40}$/.test(result)) throw new Error(name + " debe ser un SHA válido.");
  return result;
}

function boundedText(value, maxLength) {
  return String(value ?? "").slice(0, maxLength);
}

function sanitizeMetricValue(value, path, context = { count: 0, depth: 0 }) {
  context.count += 1;
  if (context.count > 100) throw new Error("Demasiados valores métricos en " + path);
  if (typeof value === "number") {
    if (!Number.isFinite(value) || value < 0) throw new Error("Métrica inválida en " + path);
    return value;
  }
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    throw new Error("Métrica no numérica en " + path);
  }
  if (++context.depth > 6) throw new Error("Métrica demasiado anidada en " + path);
  const entries = Object.entries(value);
  if (entries.length === 0) throw new Error("Métrica vacía en " + path);
  const sanitized = {};
  for (const [key, child] of entries) {
    if (!/^[a-zA-Z][a-zA-Z0-9_-]*$/.test(key)) throw new Error("Nombre de métrica inválido en " + path);
    sanitized[key] = sanitizeMetricValue(child, path + "." + key, context);
  }
  context.depth -= 1;
  return sanitized;
}

function sanitizeMetrics(metrics) {
  const result = {};
  const context = { count: 0, depth: 0 };
  for (const [key, value] of Object.entries(metrics || {})) {
    if (!/^[a-zA-Z][a-zA-Z0-9_-]*$/.test(key)) throw new Error("Nombre de métrica inválido: " + key);
    result[key] = sanitizeMetricValue(value, key, context);
  }
  return result;
}

function processStatus(value) {
  return PROCESS_STATUSES.has(value) ? value : "unknown";
}

function normalizeProcess(report) {
  return {
    overall: processStatus(report.overall),
    mainProtection: processStatus(report.governance?.ruleset?.status),
    workflow: processStatus(report.workflow?.status),
    checks: (report.checks || []).map((check) => ({
      id: boundedText(check.id, 80),
      status: processStatus(check.status)
    }))
  };
}

function normalizeQuality(report) {
  const evidence = report.qualityEvidence || {};
  const status = QUALITY_STATUSES.has(evidence.status) ? evidence.status : "unavailable";
  const base = {
    status,
    gates: [],
    metrics: {}
  };

  if (status === "current") {
    const headSha = requireSha(report.repository?.headSha, report.repository?.id + ".repository.headSha");
    const validatedSha = requireSha(evidence.validatedCommitSha, report.repository?.id + ".qualityEvidence.validatedCommitSha");
    const summary = evidence.summary;
    if (!summary || validatedSha !== headSha || summary.commit?.sha !== headSha) {
      throw new Error("La evidencia no coincide exactamente con el HEAD de " + report.repository?.id + ".");
    }
    if (!summary.run?.completedAt || Number.isNaN(Date.parse(summary.run.completedAt))) {
      throw new Error("La evidencia no contiene una fecha válida en " + report.repository?.id + ".");
    }
    if (!new Set(["passed", "failed", "unknown"]).has(summary.conclusion)) {
      throw new Error("Conclusión inválida en " + report.repository?.id + ".");
    }
    base.commitSha = headSha;
    base.validatedAt = summary.run.completedAt;
    base.conclusion = summary.conclusion;
    base.gates = (summary.gates || []).map((gate) => ({
      id: boundedText(gate.id, 80),
      label: boundedText(gate.label, 160),
      applicability: gate.applicability,
      status: gate.status,
      details: boundedText(gate.details, 400)
    }));
    base.metrics = sanitizeMetrics(summary.metrics);
    return base;
  }

  const currentHeadSha = report.repository?.headSha;
  if (currentHeadSha) base.currentHeadSha = requireSha(currentHeadSha, report.repository.id + ".repository.headSha");
  base.message = boundedText(evidence.message || "Evidencia no disponible.", 200);
  return base;
}

function normalizeRepository(report) {
  const repository = report.repository || {};
  const profile = report.profile || {};
  return {
    id: boundedText(repository.id, 80),
    repository: boundedText(repository.fullName, 200),
    kind: profile.kind === "static" ? "static" : "node",
    visibility: repository.visibility === "private" ? "private" : "public",
    notApplicableAreas: Array.isArray(profile.notApplicableAreas)
      ? profile.notApplicableAreas.map((item) => boundedText(item, 120))
      : [],
    process: normalizeProcess(report),
    quality: normalizeQuality(report)
  };
}

function identityFor(snapshot) {
  return {
    schemaVersion: snapshot.schemaVersion,
    standard: snapshot.standard,
    repositories: snapshot.repositories.map((repository) => ({
      id: repository.id,
      repository: repository.repository,
      process: repository.process,
      quality: repository.quality
    }))
  };
}

export function snapshotId(snapshot) {
  return createHash("sha256").update(JSON.stringify(identityFor(snapshot))).digest("hex");
}

export function buildQualityHistorySnapshot(data, { now = new Date(), dashboardCommitSha = process.env.GITHUB_SHA } = {}) {
  if (!data || data.schemaVersion !== 1 || !Array.isArray(data.repositories)) {
    throw new Error("data.json no tiene el contrato esperado.");
  }
  const currentDashboardSha = requireSha(dashboardCommitSha, "GITHUB_SHA");
  if (data.source?.commit && data.source.commit !== currentDashboardSha) {
    throw new Error("data.json no corresponde al commit del dashboard que se está validando.");
  }

  const repositories = data.repositories.map(normalizeRepository).sort((left, right) => left.id.localeCompare(right.id));
  if (!repositories.some((repository) => repository.quality.status === "current")) return null;

  const snapshot = {
    schemaVersion: 1,
    id: "pending",
    generatedAt: now.toISOString(),
    dashboardCommitSha: currentDashboardSha,
    standard: {
      release: boundedText(data.source?.standardRelease || "unknown", 40),
      sha: requireSha(data.source?.standardSha, "data.source.standardSha")
    },
    repositories
  };
  snapshot.id = snapshotId(snapshot);
  if (TOKEN_PATTERN.test(JSON.stringify(snapshot))) throw new Error("El snapshot contiene un patrón que parece un token.");
  validateQualityHistory(snapshot);
  return snapshot;
}

function apiUrl(path) {
  return path.startsWith("http") ? path : API_ROOT + path;
}

function authHeaders(token, accept = "application/vnd.github+json") {
  return {
    Accept: accept,
    Authorization: "Bearer " + token,
    "X-GitHub-Api-Version": "2022-11-28",
    "User-Agent": "project-quality-history"
  };
}

async function githubRequest(path, { token, method = "GET", body, accept } = {}) {
  const response = await fetch(apiUrl(path), {
    method,
    headers: {
      ...authHeaders(token, accept),
      ...(body ? { "Content-Type": "application/json" } : {})
    },
    body: body ? JSON.stringify(body) : undefined
  });
  let data = null;
  try { data = await response.json(); } catch {}
  return { ok: response.ok, status: response.status, data };
}

async function getOrCreateRelease({ repository, period, token, targetCommit }) {
  const tag = "quality-history-" + period;
  const existing = await githubRequest(`/repos/${repository}/releases/tags/${tag}`, { token });
  if (existing.ok) return existing.data;
  if (existing.status !== 404) throw new Error("No se pudo consultar el release histórico.");

  const created = await githubRequest(`/repos/${repository}/releases`, {
    token,
    method: "POST",
    body: {
      tag_name: tag,
      target_commitish: targetCommit,
      name: "Quality history " + period,
      body: "Snapshots sanitizados de calidad validados durante " + period + ".",
      draft: false,
      prerelease: false,
      generate_release_notes: false
    }
  });
  if (!created.ok) throw new Error("No se pudo crear el release histórico.");
  return created.data;
}

async function listAssets(release, repository, token) {
  const response = await githubRequest(`/repos/${repository}/releases/${release.id}/assets?per_page=100`, { token });
  if (!response.ok) throw new Error("No se pudieron consultar los assets históricos.");
  return response.data?.filter((asset) => asset && typeof asset.name === "string") || [];
}

async function uploadAsset(release, name, content, token) {
  const uploadUrl = String(release.upload_url || "").replace(/\{\?.*$/, "");
  if (!uploadUrl) throw new Error("El release histórico no tiene URL de subida.");
  const response = await fetch(uploadUrl + "?name=" + encodeURIComponent(name), {
    method: "POST",
    headers: {
      ...authHeaders(token),
      "Content-Type": "application/octet-stream",
      "Content-Length": String(Buffer.byteLength(content))
    },
    body: content
  });
  if (!response.ok) throw new Error("No se pudo publicar el asset histórico.");
}

export async function persistSnapshot(snapshot, { repository, token, targetCommit } = {}) {
  const repo = requireText(repository, "GITHUB_REPOSITORY");
  const secret = requireText(token, "GITHUB_TOKEN");
  validateQualityHistory(snapshot);
  const period = snapshot.generatedAt.slice(0, 7);
  const release = await getOrCreateRelease({ repository: repo, period, token: secret, targetCommit: targetCommit || "main" });
  const assetName = "quality-snapshot-" + snapshot.id + ".json";
  const assets = await listAssets(release, repo, secret);
  if (assets.some((asset) => asset.name === assetName)) return { created: false, period, assetName };
  const content = JSON.stringify(snapshot, null, 2) + "\n";
  await uploadAsset(release, assetName, content, secret);
  return { created: true, period, assetName };
}

async function main() {
  const siteDir = process.env.HISTORY_SITE_DIR || "site";
  const data = JSON.parse(await readFile(resolve(siteDir, "data.json"), "utf8"));
  const snapshot = buildQualityHistorySnapshot(data);
  if (!snapshot) {
    console.log("No hay evidencia actual validada para guardar en el histórico.");
    return;
  }
  const result = await persistSnapshot(snapshot, {
    repository: process.env.GITHUB_REPOSITORY,
    token: process.env.GITHUB_TOKEN,
    targetCommit: process.env.GITHUB_SHA
  });
  console.log((result.created ? "Snapshot histórico publicado: " : "Snapshot histórico ya existente: ") + result.assetName);
}

const entrypoint = process.argv[1] ? pathToFileURL(resolve(process.argv[1])).href : "";
if (entrypoint === import.meta.url) await main();
