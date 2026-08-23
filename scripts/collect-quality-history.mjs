import { readFile, rm, writeFile } from "node:fs/promises";
import { pathToFileURL } from "node:url";
import { resolve } from "node:path";
import { buildQualityHistorySnapshot } from "./persist-quality-history.mjs";
import { validateQualityHistory } from "./validate-quality-history.mjs";
import { validateQualityHistoryIndex } from "./validate-quality-history-index.mjs";
import { createQuarantineEntry, createQuarantineManifest } from "./history-quarantine.mjs";
import { listHistoryReleases, listReleaseAssets } from "./history-pagination.mjs";
import { CONTRACT_REGEXP, canonicalJson } from "./quality-contract.mjs";

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

async function defaultFetchJson(path, token) {
  const response = await fetch(API_ROOT + path, { headers: authHeaders(token) });
  let data = null;
  try {
    data = await response.json();
  } catch {
    data = null;
  }
  return { ok: response.ok, status: response.status, data };
}

async function defaultFetchAssetBody(path, token) {
  const response = await fetch(API_ROOT + path, { headers: authHeaders(token, "application/octet-stream") });
  if (!response.ok) return { ok: false, status: response.status };
  try {
    return { ok: true, status: response.status, text: await response.text() };
  } catch {
    return { ok: false, status: 0 };
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
  const fetchJson = deps.fetchJson || ((path) => defaultFetchJson(path, secret));
  const fetchAssetBody = deps.fetchAssetBody || ((path) => defaultFetchAssetBody(path, secret));
  const perPage = deps.perPage;

  const entries = [];
  const snapshots = currentSnapshot ? [currentSnapshot] : [];

  for (const release of await listHistoryReleases(repo, fetchJson, { perPage })) {
    if (!Number.isInteger(release.id) || release.id < 1) {
      throw new Error("Release histórico sin identificador válido: " + (release.tag_name || "?"));
    }
    for (const asset of await listReleaseAssets(repo, release, fetchJson, { perPage })) {
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
  const result = await collectQualityHistory({ repository, token, currentSnapshot, deps, now });
  const historyPath = resolve(siteDir, "history.json");
  const quarantinePath = resolve(siteDir, "history-quarantine.json");

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
