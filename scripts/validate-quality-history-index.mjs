import { readFile } from "node:fs/promises";
import { pathToFileURL } from "node:url";
import { resolve } from "node:path";
import { snapshotId } from "./persist-quality-history.mjs";
import { validateQualityHistory } from "./validate-quality-history.mjs";
import {
  QUALITY_HISTORY_INDEX_KEYS,
  TOKEN_PATTERN,
  isRfc3339DateTime
} from "./quality-contract.mjs";

function fail(message) {
  throw new Error(message);
}

function assert(condition, message) {
  if (!condition) fail(message);
}

function keys(value, allowed, path) {
  for (const key of Object.keys(value)) {
    if (!allowed.has(key)) fail(path + "." + key + " no está permitido.");
  }
}

function rejectUnsafe(value, path = "$", seen = new Set()) {
  if (value === null) fail(path + " no puede contener null.");
  if (typeof value === "string") {
    if (TOKEN_PATTERN.test(value)) fail(path + " contiene un patrón que parece un token.");
    if (/https?:\/\//i.test(value)) fail(path + " no puede contener URLs.");
    return;
  }
  if (typeof value !== "object") return;
  if (seen.has(value)) fail(path + " contiene una referencia circular.");
  seen.add(value);
  if (Array.isArray(value)) {
    value.forEach((item, index) => rejectUnsafe(item, path + "[" + index + "]", seen));
  } else {
    for (const [key, child] of Object.entries(value)) {
      if (key.toLowerCase() === "url") fail(path + "." + key + " no está permitido.");
      rejectUnsafe(child, path + "." + key, seen);
    }
  }
  seen.delete(value);
}

export function validateQualityHistoryIndex(index) {
  assert(index && typeof index === "object" && !Array.isArray(index), "El índice histórico debe ser un objeto.");
  keys(index, QUALITY_HISTORY_INDEX_KEYS, "index");
  assert(index.schemaVersion === 1, "schemaVersion del índice debe ser 1.");
  assert(isRfc3339DateTime(index.generatedAt), "generatedAt del índice debe ser una fecha RFC3339 válida.");
  assert(Array.isArray(index.snapshots), "snapshots debe ser un array.");

  const ids = new Set();
  let previousTimestamp = Number.POSITIVE_INFINITY;
  for (const [indexPosition, snapshot] of index.snapshots.entries()) {
    const path = "snapshots[" + indexPosition + "]";
    validateQualityHistory(snapshot);
    assert(snapshot.id === snapshotId(snapshot), path + ".id no coincide con su contenido.");
    assert(!ids.has(snapshot.id), "Snapshot duplicado: " + snapshot.id);
    ids.add(snapshot.id);

    const timestamp = Date.parse(snapshot.generatedAt);
    assert(!Number.isNaN(timestamp), path + ".generatedAt no es válido.");
    assert(timestamp <= previousTimestamp, "Los snapshots deben estar ordenados del más reciente al más antiguo.");
    previousTimestamp = timestamp;
  }

  rejectUnsafe(index);
  return true;
}

async function main() {
  const file = process.argv[2] || "history.json";
  const index = JSON.parse(await readFile(file, "utf8"));
  validateQualityHistoryIndex(index);
  console.log("Índice histórico válido: " + index.snapshots.length + " snapshots.");
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
