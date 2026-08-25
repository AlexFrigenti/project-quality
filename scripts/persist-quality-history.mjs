import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { pathToFileURL } from "node:url";
import { resolve } from "node:path";
import {
  canonicalJson,
  HISTORY_CURRENT_IDENTITY_VERSION,
  HISTORY_IDENTITY_VERSIONS
} from "./quality-contract.mjs";
import { validateQualityHistory } from "./validate-quality-history.mjs";
import { listHistoryReleases, listReleaseAssets } from "./history-pagination.mjs";
import { withRetry, singleAttemptFetch, resilientFetch } from "./github-api-request.mjs";

const API_ROOT = "https://api.github.com";
const TOKEN_PATTERN = /(gh[pousr]_[A-Za-z0-9_]+|github_pat_[A-Za-z0-9_]+|Bearer\s+[A-Za-z0-9._-]+)/i;
const PROCESS_STATUSES = new Set(["pass", "warning", "fail", "unknown", "pending", "missing", "not_applicable"]);
const QUALITY_STATUSES = new Set(["current", "pending", "unavailable"]);

function isConclusive404ForTag(res) {
  return res && res.status === 404 && res.data !== null && typeof res.data === "object" && !Array.isArray(res.data);
}

function isTransientPostStatus(status, headers) {
  if (status === 408 || status === 429 || status === 500 || status === 502 || status === 503 || status === 504) return true;
  if (status === 403) {
    const v = headers?.get ? headers.get("x-ratelimit-remaining") : headers?.["x-ratelimit-remaining"];
    return v === "0" || v === 0;
  }
  return false;
}

async function resilientGetTag(tag, repo, token, deps) {
  const operation = async () => {
    if (deps.request) return deps.request(`/repos/${repo}/releases/tags/${tag}`, { token });
    const res = await resilientFetch(apiUrl(`/repos/${repo}/releases/tags/${tag}`), { headers: authHeaders(token) }, deps);
    let data = null;
    try { data = await res.json(); } catch {}
    return { ok: res.ok, status: res.status, data, headers: res.headers, errorType: res.errorType };
  };
  return withRetry(operation, deps);
}

async function singlePostRelease(repo, tag, period, token, targetCommit, deps) {
  const body = {
    tag_name: tag,
    target_commitish: targetCommit,
    name: "Quality history " + period,
    body: "Snapshots sanitizados de calidad validados durante " + period + ".",
    draft: false,
    prerelease: false,
    generate_release_notes: false
  };
  if (deps.request) return deps.request(`/repos/${repo}/releases`, { token, method: "POST", body });
  const res = await singleAttemptFetch(apiUrl(`/repos/${repo}/releases`), { method: "POST", headers: { ...authHeaders(token), "Content-Type": "application/json" }, body: JSON.stringify(body) }, deps);
  let data = null;
  try { data = await res.json(); } catch {}
  return { ok: res.ok, status: res.status, data, headers: res.headers };
}

async function findAssetResilient(assetName, repo, token, deps, perPage) {
  const fetchJson = async (path) => {
    const operation = async () => {
      if (deps.request) return deps.request(path, { token });
      const res = await resilientFetch(apiUrl(path), { headers: authHeaders(token) }, deps);
      let data = null;
      try { data = await res.json(); } catch {}
      return { ok: res.ok, status: res.status, data, headers: res.headers, errorType: res.errorType };
    };
    return withRetry(operation, deps);
  };
  const releases = await listHistoryReleases(repo, fetchJson, { perPage });
  for (const release of releases) {
    const assets = await listReleaseAssets(repo, release, fetchJson, { perPage });
    const found = assets.find((a) => a?.name === assetName);
    if (found) return { found: true, release, asset: found };
  }
  return { found: false };
}

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
    if (!summary || evidence.currentCommitSha !== headSha || validatedSha !== headSha || summary.commit?.sha !== headSha) {
      throw new Error("La evidencia no coincide exactamente con el HEAD de " + report.repository?.id + ".");
    }
    const defaultBranch = report.repository?.defaultBranch || "main";
    if (summary.commit?.branch !== defaultBranch) {
      throw new Error("La evidencia no pertenece a la rama estable de " + report.repository?.id + ".");
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
    if (!Array.isArray(summary.gates) || summary.gates.length === 0) {
      throw new Error("La evidencia no contiene gates en " + report.repository?.id + ".");
    }
    base.gates = summary.gates.map((gate) => ({
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

function legacyIdentityFor(snapshot) {
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

function compareById(left, right) {
  return left.id < right.id ? -1 : left.id > right.id ? 1 : 0;
}

function semanticQualityIdentity(quality) {
  const identity = {
    status: quality.status,
    gates: [...quality.gates]
      .sort(compareById)
      .map((gate) => ({
        id: gate.id,
        applicability: gate.applicability,
        status: gate.status
      })),
    metrics: quality.metrics
  };
  if (quality.commitSha !== undefined) identity.commitSha = quality.commitSha;
  if (quality.currentHeadSha !== undefined) identity.currentHeadSha = quality.currentHeadSha;
  if (quality.conclusion !== undefined) identity.conclusion = quality.conclusion;
  return identity;
}

function semanticRepositoryIdentity(repository) {
  return {
    id: repository.id,
    repository: repository.repository,
    kind: repository.kind,
    notApplicableAreas: [...repository.notApplicableAreas].sort(),
    process: {
      overall: repository.process.overall,
      mainProtection: repository.process.mainProtection,
      workflow: repository.process.workflow,
      checks: [...repository.process.checks]
        .sort(compareById)
        .map((check) => ({
          id: check.id,
          status: check.status
        }))
    },
    quality: semanticQualityIdentity(repository.quality)
  };
}

function semanticIdentityFor(snapshot) {
  return {
    schemaVersion: snapshot.schemaVersion,
    identityVersion: snapshot.identityVersion,
    standard: {
      release: snapshot.standard.release,
      sha: snapshot.standard.sha
    },
    repositories: [...snapshot.repositories]
      .sort(compareById)
      .map(semanticRepositoryIdentity)
  };
}

export function snapshotId(snapshot) {
  const identityVersion = snapshot.identityVersion ?? 1;
  if (!HISTORY_IDENTITY_VERSIONS.has(identityVersion)) {
    throw new Error("identityVersion no soportada: " + identityVersion);
  }
  const identity = identityVersion === 2
    ? semanticIdentityFor(snapshot)
    : legacyIdentityFor(snapshot);
  return createHash("sha256")
    .update(identityVersion === 2 ? canonicalJson(identity) : JSON.stringify(identity))
    .digest("hex");
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
    identityVersion: HISTORY_CURRENT_IDENTITY_VERSION,
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

async function getOrCreateRelease({ repository, period, token, targetCommit, deps = {} }) {
  const tag = "quality-history-" + period;
  const request = deps.request || githubRequest;

  async function resilientGetTag() {
    const operation = async () => request(`/repos/${repository}/releases/tags/${tag}`, { token });
    return withRetry(operation, deps);
  }

  async function singlePostRelease() {
    const body = {
      tag_name: tag,
      target_commitish: targetCommit,
      name: "Quality history " + period,
      body: "Snapshots sanitizados de calidad validados durante " + period + ".",
      draft: false,
      prerelease: false,
      generate_release_notes: false
    };
    if (deps.request) {
      return deps.request(`/repos/${repository}/releases`, { token, method: "POST", body });
    }
    const res = await singleAttemptFetch(apiUrl(`/repos/${repository}/releases`), { method: "POST", headers: { ...authHeaders(token), "Content-Type": "application/json" }, body: JSON.stringify(body) }, deps);
    let data = null;
    try { data = await res.json(); } catch {}
    return { ok: res.ok, status: res.status, data, headers: res.headers };
  }

  let firstGet;
  try {
    firstGet = await resilientGetTag();
  } catch (e) {
    throw new Error("No se pudo consultar el release histórico: " + String(e.message || e).slice(0, 200));
  }
  if (firstGet.ok) return firstGet.data;
  if (!isConclusive404ForTag(firstGet)) {
    throw new Error("No se pudo verificar ausencia del release " + tag + ": HTTP " + firstGet.status);
  }

  let firstPost;
  let firstPostThrew = false;
  try {
    firstPost = await singlePostRelease();
  } catch (e) {
    firstPostThrew = true;
    firstPost = { thrown: e };
  }
  if (!firstPostThrew && firstPost.ok) return firstPost.data;
  if (!firstPostThrew && !isTransientPostStatus(firstPost.status, firstPost.headers)) {
    throw new Error("POST falló definitivo: HTTP " + firstPost.status);
  }

  let reconciled;
  try {
    reconciled = await resilientGetTag();
  } catch (e) {
    throw new Error("Fallo ambiguo sin tercer POST: no se pudo reconciliar tras POST");
  }
  if (reconciled.ok) return reconciled.data;
  if (!isConclusive404ForTag(reconciled)) {
    throw new Error("Fallo ambiguo sin ausencia concluyente");
  }

  let secondPost;
  let secondPostThrew = false;
  try {
    secondPost = await singlePostRelease();
  } catch (e) {
    secondPostThrew = true;
    secondPost = { thrown: e };
  }
  if (!secondPostThrew && secondPost.ok) return secondPost.data;
  if (!secondPostThrew && !isTransientPostStatus(secondPost.status, secondPost.headers) && secondPost.status !== 0) {
    throw new Error("Segundo POST falló: HTTP " + secondPost.status);
  }

  let finalCheck;
  try {
    finalCheck = await resilientGetTag();
  } catch (e) {
    throw new Error("Fallo ambiguo persistente sin tercer POST");
  }
  if (finalCheck.ok) return finalCheck.data;
  throw new Error("Fallo ambiguo persistente sin tercer POST");
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

async function singleUploadAssetResilient(release, name, content, token, deps) {
  if (deps.upload) {
    const result = await deps.upload({ release, name, content });
    if (result === undefined) return { ok: true, status: 201, headers: { get: () => null, has: () => false } };
    return result;
  }
  const uploadUrl = String(release.upload_url || "").replace(/\{\?.*$/, "") + "?name=" + encodeURIComponent(name);
  const res = await singleAttemptFetch(uploadUrl, { method: "POST", headers: { ...authHeaders(token), "Content-Type": "application/octet-stream", "Content-Length": String(Buffer.byteLength(content)) }, body: content }, deps);
  return { ok: res.ok, status: res.status, headers: res.headers };
}

export async function persistSnapshot(snapshot, { repository, token, targetCommit, deps = {} } = {}) {
  const repo = requireText(repository, "GITHUB_REPOSITORY");
  const secret = requireText(token, "GITHUB_TOKEN");
  validateQualityHistory(snapshot);
  const period = snapshot.generatedAt.slice(0, 7);
  const assetName = "quality-snapshot-" + snapshot.id + ".json";
  const perPage = deps.perPage;

  let findResult;
  try {
    findResult = await findAssetResilient(assetName, repo, secret, deps, perPage);
  } catch (e) {
    throw new Error("No se pudo buscar asset existente: " + String(e.message || e).slice(0, 200));
  }
  if (findResult.found) {
    return {
      created: false,
      period,
      assetName,
      existingRelease: { id: findResult.release.id, tag: findResult.release.tag_name }
    };
  }

  const release = await getOrCreateRelease({ repository: repo, period, token: secret, targetCommit: targetCommit || "main", deps });

  let firstUpload;
  let firstUploadThrew = false;
  try {
    firstUpload = await singleUploadAssetResilient(release, assetName, JSON.stringify(snapshot, null, 2) + "\n", secret, deps);
  } catch (e) {
    firstUploadThrew = true;
    firstUpload = { thrown: e };
  }
  if (!firstUploadThrew && firstUpload.ok) return { created: true, period, assetName };
  if (!firstUploadThrew && !isTransientPostStatus(firstUpload.status, firstUpload.headers)) {
    throw new Error("POST de asset falló definitivo: HTTP " + firstUpload.status);
  }

  let rebúsqueda;
  try {
    rebúsqueda = await findAssetResilient(assetName, repo, secret, deps, perPage);
  } catch (e) {
    throw new Error("Fallo ambiguo sin tercer POST tras subida");
  }
  if (rebúsqueda.found) return { created: true, period, assetName, existingRelease: { id: rebúsqueda.release.id, tag: rebúsqueda.release.tag_name } };
  if (rebúsqueda.found === false) {
    // Need to check if search was conclusive: findAssetResilient would have thrown if uncertain, so reaching here means conclusive absence
    let secondUpload;
    let secondUploadThrew = false;
    try {
      secondUpload = await singleUploadAssetResilient(release, assetName, JSON.stringify(snapshot, null, 2) + "\n", secret, deps);
    } catch (e) {
      secondUploadThrew = true;
      secondUpload = { thrown: e };
    }
    if (!secondUploadThrew && secondUpload.ok) return { created: true, period, assetName };
    if (!secondUploadThrew && !isTransientPostStatus(secondUpload.status, secondUpload.headers) && secondUpload.status !== 0) {
      throw new Error("Segundo POST de asset falló: HTTP " + secondUpload.status);
    }
    let finalSearch;
    try {
      finalSearch = await findAssetResilient(assetName, repo, secret, deps, perPage);
    } catch (e) {
      throw new Error("Fallo ambiguo persistente sin tercer POST");
    }
    if (finalSearch.found) return { created: true, period, assetName, existingRelease: { id: finalSearch.release.id, tag: finalSearch.release.tag_name } };
    throw new Error("Fallo ambiguo persistente sin tercer POST tras subida");
  }
  throw new Error("Fallo ambiguo sin ausencia concluyente tras subida");
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
