import { readFile, writeFile } from "node:fs/promises";
import { pathToFileURL } from "node:url";
import { resolve } from "node:path";
import { buildQualityHistorySnapshot } from "./persist-quality-history.mjs";
import { validateQualityHistory } from "./validate-quality-history.mjs";
import { validateQualityHistoryIndex } from "./validate-quality-history-index.mjs";

const API_ROOT = "https://api.github.com";
const RELEASE_TAG_PATTERN = /^quality-history-\d{4}-\d{2}$/;
const ASSET_PATTERN = /^quality-snapshot-([0-9a-f]{64})\.json$/;

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

async function githubJson(path, token) {
  const response = await fetch(API_ROOT + path, { headers: authHeaders(token) });
  if (!response.ok) throw new Error("No se pudo consultar el histórico persistente.");
  try {
    return await response.json();
  } catch {
    throw new Error("La respuesta del histórico persistente no es JSON.");
  }
}

async function downloadSnapshot(asset, token) {
  const response = await fetch(asset.url, {
    headers: authHeaders(token, "application/octet-stream")
  });
  if (!response.ok) throw new Error("No se pudo descargar un snapshot histórico.");
  try {
    const snapshot = await response.json();
    validateQualityHistory(snapshot);
    return snapshot;
  } catch (error) {
    if (error instanceof Error && error.message.includes("Snapshot")) throw error;
    throw new Error("Un asset histórico no contiene un snapshot válido.");
  }
}

async function listHistoryReleases(repository, token) {
  const releases = [];
  for (let page = 1; page <= 20; page += 1) {
    const batch = await githubJson(
      "/repos/" + repository + "/releases?per_page=100&page=" + page,
      token
    );
    if (!Array.isArray(batch)) throw new Error("La lista de releases históricos no es válida.");
    releases.push(...batch.filter((release) => RELEASE_TAG_PATTERN.test(release?.tag_name || "")));
    if (batch.length < 100) break;
  }
  return releases.sort((left, right) => {
    const leftDate = Date.parse(left.published_at || left.created_at || "") || 0;
    const rightDate = Date.parse(right.published_at || right.created_at || "") || 0;
    return rightDate - leftDate;
  });
}

async function listSnapshotAssets(repository, release, token) {
  const assets = await githubJson(
    "/repos/" + repository + "/releases/" + release.id + "/assets?per_page=100",
    token
  );
  if (!Array.isArray(assets)) throw new Error("Los assets históricos no tienen un formato válido.");
  return assets.filter((asset) => ASSET_PATTERN.test(asset?.name || ""));
}

export function buildHistoryIndex(snapshots, { now = new Date() } = {}) {
  const byId = new Map();
  for (const snapshot of snapshots) {
    validateQualityHistory(snapshot);
    byId.set(snapshot.id, snapshot);
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

export async function collectQualityHistory({ repository, token, currentSnapshot } = {}) {
  const repo = requireText(repository, "GITHUB_REPOSITORY");
  const secret = requireText(token, "GITHUB_TOKEN");
  const snapshots = currentSnapshot ? [currentSnapshot] : [];

  for (const release of await listHistoryReleases(repo, secret)) {
    for (const asset of await listSnapshotAssets(repo, release, secret)) {
      const match = asset.name.match(ASSET_PATTERN);
      const snapshot = await downloadSnapshot(asset, secret);
      if (snapshot.id !== match[1]) throw new Error("El nombre de un asset no coincide con su snapshot.");
      snapshots.push(snapshot);
    }
  }

  return buildHistoryIndex(snapshots);
}

async function main() {
  const siteDir = process.env.HISTORY_SITE_DIR || "site";
  const repository = process.env.HISTORY_REPOSITORY || process.env.GITHUB_REPOSITORY;
  const token = process.env.GITHUB_TOKEN;
  const data = JSON.parse(await readFile(resolve(siteDir, "data.json"), "utf8"));
  const currentSnapshot = buildQualityHistorySnapshot(data);
  const index = await collectQualityHistory({
    repository,
    token,
    currentSnapshot
  });
  await writeFile(resolve(siteDir, "history.json"), JSON.stringify(index, null, 2) + "\n");
  console.log("Índice histórico generado: " + index.snapshots.length + " snapshots.");
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
