import { readFile, rm, writeFile } from "node:fs/promises";
import { pathToFileURL } from "node:url";
import { resolve } from "node:path";
import { buildQualityHistorySnapshot } from "./persist-quality-history.mjs";
import { validateQualityHistory } from "./validate-quality-history.mjs";
import { validateQualityHistoryIndex } from "./validate-quality-history-index.mjs";
import { createQuarantineEntry, createQuarantineManifest } from "./history-quarantine.mjs";
import { listHistoryReleases, listReleaseAssets } from "./history-pagination.mjs";
import { CONTRACT_REGEXP, canonicalJson } from "./quality-contract.mjs";
import { resilientFetch, withRetry } from "./github-api-request.mjs";

const API_ROOT = "https://api.github.com";

function requireText(value, name) {
  if (typeof value !== "string" || value.trim() === "") throw new Error(name + " es obligatorio.");
  return value.trim();
}

function authHeaders(token, accept = "application/vnd.github+json") {
  return {
    Accept: accept,
    Authorization: "Bearer " + token,
    "X-GitHub-Api-Version": "2022-11-28",
    "User-Agent": "project-quality-history-index"
  };
}

async function resilientJsonFetch(path, token, deps) {
  const res = await resilientFetch(API_ROOT + path, { headers: authHeaders(token) }, deps);
  let data = null;
  try {
    data = await res.json();
  } catch {
    data = null;
  }
  return { ok: res.ok, status: res.status, data, headers: res.headers, errorType: res.errorType };
}

async function resilientAssetFetch(path, token, deps) {
  const res = await resilientFetch(API_ROOT + path, { headers: authHeaders(token, "application/octet-stream") }, deps);
  if (!res.ok) return { ok: false, status: res.status, headers: res.headers, errorType: res.errorType };
  try {
    return { ok: true, status: res.status, headers: res.headers, text: await res.text() };
  } catch {
    return { ok: false, status: 0, headers: { get: () => null, has: () => false } };
  }
}

export function buildHistoryIndex(snapshots, { now = new Date() } = {}) {
  const byId = new Map();
  for (const snapshot of snapshots) {
    validateQualityHistory(snapshot);
    const existing = byId.get(snapshot.id);
    byId.set(snapshot.id, existing ? pickRepresentative(existing, snapshot) : snapshot);
  }

  const ordered = [...byId.values()].sort((left, right) => {
    return Date.parse(right.generatedAt) - Date.parse(left.generatedAt);
  });
  const index = {
    schemaVersion: 1,
    generatedAt: now.toISOString(),
    snapshots: ordered
  };
  validateQualityHistoryIndex(index);
  return index;
}

function pickRepresentative(left, right) {
  const leftTime = Date.parse(left.generatedAt);
  const rightTime = Date.parse(right.generatedAt);
  if (leftTime !== rightTime) return leftTime > rightTime ? left : right;
  return canonicalJson(left) <= canonicalJson(right) ? left : right;
}

async function evaluateSnapshotAsset({ repository, release, asset, expectedId, fetchAssetBody }) {
  const body = await fetchAssetBody("/repos/" + repository + "/releases/assets/" + asset.id);
  if (!body?.ok) {
    return {
      entry: createQuarantineEntry({
        releaseTag: release.tag_name,
        releaseId: release.id,
        assetId: asset.id,
        assetName: asset.name,
        reason: "download-failed",
        detail: "Descarga fallida (HTTP " + (body?.status ?? 0) + ")."
      })
    };
  }

  let parsed;
  try {
    parsed = JSON.parse(body.text);
  } catch (error) {
    return {
      entry: createQuarantineEntry({
        releaseTag: release.tag_name,
        releaseId: release.id,
        assetId: asset.id,
        assetName: asset.name,
        reason: "invalid-json",
        detail: error instanceof Error ? error.message : String(error)
      })
    };
  }

  try {
    validateQualityHistory(parsed);
  } catch (error) {
    return {
      entry: createQuarantineEntry({
        releaseTag: release.tag_name,
        releaseId: release.id,
        assetId: asset.id,
        assetName: asset.name,
        reason: "invalid-snapshot",
        detail: error instanceof Error ? error.message : String(error)
      })
    };
  }

  if (parsed.id !== expectedId) {
    return {
      entry: createQuarantineEntry({
        releaseTag: release.tag_name,
        releaseId: release.id,
        assetId: asset.id,
        assetName: asset.name,
        reason: "asset-id-mismatch",
        detail: "El id del contenido no coincide con el nombre del asset."
      })
    };
  }

  return { snapshot: parsed };
}

export async function collectQualityHistory({ repository, token, currentSnapshot, deps = {}, now = new Date() } = {}) {
  const repo = requireText(repository, "GITHUB_REPOSITORY");
  const secret = requireText(token, "GITHUB_TOKEN");
  const baseFetchJson = deps.fetchJson || null;
  const baseFetchAssetBody = deps.fetchAssetBody || null;
  const fetchJson = (path) => {
    if (baseFetchJson) return withRetry(() => baseFetchJson(path), deps);
    return resilientJsonFetch(path, secret, deps);
  };
  const fetchAssetBody = (path) => {
    if (baseFetchAssetBody) return withRetry(() => baseFetchAssetBody(path), deps);
    return resilientAssetFetch(path, secret, deps);
  };
  const perPage = deps.perPage;

  const entries = [];
  const snapshots = currentSnapshot ? [currentSnapshot] : [];

  let releases;
  try {
    releases = await listHistoryReleases(repo, fetchJson, { perPage });
  } catch (e) {
    const msg = String(e.message || e);
    if (msg.includes("límite de paginación") || msg.includes("tag inválido") || msg.includes("no es válida")) throw e;
    return { ok: false, error: msg.slice(0, 200) };
  }
  for (const release of releases) {
    if (!Number.isInteger(release.id) || release.id < 1) {
      throw new Error("Release histórico sin identificador válido: " + (release.tag_name || "?"));
    }
    let assets;
    try {
      assets = await listReleaseAssets(repo, release, fetchJson, { perPage });
    } catch (e) {
      const msg = String(e.message || e);
      if (msg.includes("límite de paginación") || msg.includes("no es válida")) throw e;
      return { ok: false, error: msg.slice(0, 200) };
    }
    for (const asset of assets) {
      const name = typeof asset?.name === "string" ? asset.name : "";
      if (!name.startsWith("quality-snapshot-")) continue;
      const match = name.match(CONTRACT_REGEXP.historyAssetName);
      const assetId = Number.isInteger(asset?.id) && asset.id >= 1 ? asset.id : null;
      if (!match) {
        entries.push(createQuarantineEntry({
          releaseTag: release.tag_name,
          releaseId: release.id,
          assetId,
          assetName: name,
          reason: "invalid-name",
          detail: "El nombre no coincide con quality-snapshot-<sha256>.json."
        }));
        continue;
      }
      if (assetId === null) {
        entries.push(createQuarantineEntry({
          releaseTag: release.tag_name,
          releaseId: release.id,
          assetId: null,
          assetName: name,
          reason: "download-failed",
          detail: "Identificador de asset ausente o no numérico."
        }));
        continue;
      }
      const outcome = await evaluateSnapshotAsset({
        repository: repo,
        release,
        asset,
        expectedId: match[1],
        fetchAssetBody
      });
      if (outcome.entry) entries.push(outcome.entry);
      else snapshots.push(outcome.snapshot);
    }
  }

  if (entries.length > 0) {
    return {
      ok: false,
      quarantine: createQuarantineManifest({ generatedAt: now.toISOString(), entries })
    };
  }

  return { ok: true, index: buildHistoryIndex(snapshots, { now }) };
}

export async function runHistoryCollection({ siteDir = "site", repository, token, currentSnapshot, deps = {}, now = new Date() } = {}) {
  const historyPath = resolve(siteDir, "history.json");
  const quarantinePath = resolve(siteDir, "history-quarantine.json");
  let result;
  try {
    result = await collectQualityHistory({ repository, token, currentSnapshot, deps, now });
  } catch (error) {
    await rm(historyPath, { force: true });
    throw error;
  }
  if (!result.ok) {
    await writeFile(quarantinePath, JSON.stringify(result.quarantine, null, 2) + "\n");
    await rm(historyPath, { force: true });
    return { ok: false, quarantine: result.quarantine };
  }

  await writeFile(historyPath, JSON.stringify(result.index, null, 2) + "\n");
  return { ok: true, index: result.index };
}

async function main() {
  const siteDir = process.env.HISTORY_SITE_DIR || "site";
  const repository = process.env.HISTORY_REPOSITORY || process.env.GITHUB_REPOSITORY;
  const token = process.env.GITHUB_TOKEN;
  const data = JSON.parse(await readFile(resolve(siteDir, "data.json"), "utf8"));
  const currentSnapshot = buildQualityHistorySnapshot(data);
  const result = await runHistoryCollection({
    siteDir,
    repository,
    token,
    currentSnapshot
  });

  if (!result.ok) {
    console.error("Histórico en cuarentena: " + result.quarantine.entries.length + " asset(s) con problemas. No se genera history.json.");
    console.error("Motivos por entrada: " + result.quarantine.entries.map((entry) => entry.reason).join(", "));
    process.exitCode = 1;
    return;
  }

  console.log("Índice histórico generado: " + result.index.snapshots.length + " snapshots.");
}

const entrypoint = process.argv[1] ? pathToFileURL(resolve(process.argv[1])).href : "";
if (entrypoint === import.meta.url) {
  try {
    await main();
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  }
}
