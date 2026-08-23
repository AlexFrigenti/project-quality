import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import {
  QUARANTINE_REASONS,
  createQuarantineEntry,
  sanitizeQuarantineDetail,
  validateQuarantineManifest
} from "./history-quarantine.mjs";
import { collectQualityHistory } from "./collect-quality-history.mjs";
import { snapshotId } from "./persist-quality-history.mjs";

const baseEntry = {
  releaseTag: "quality-history-2026-08",
  releaseId: 123,
  assetId: 456,
  assetName: "quality-snapshot-bad.json",
  reason: "invalid-json",
  detail: "JSON inválido"
};

function manifestWith(entries, extra) {
  const manifest = {
    schemaVersion: 1,
    generatedAt: "2026-08-20T06:17:00.000Z",
    entries
  };
  return { ...manifest, ...extra };
}

function rawEntry(extra) {
  return { ...structuredClone(baseEntry), ...extra };
}

{
  const manifest = manifestWith([createQuarantineEntry(baseEntry)]);
  assert.doesNotThrow(() => validateQuarantineManifest(manifest));
}

{
  const urlEntry = createQuarantineEntry({ ...baseEntry, detail: "fallo en https://api.github.com/private" });
  assert.equal(/https?:\/\//.test(urlEntry.detail), false);
  const tokenEntry = createQuarantineEntry({ ...baseEntry, detail: "leak ghp_ABCDEF1234567890abcdef" });
  assert.equal(/ghp_/.test(tokenEntry.detail), false);
  const longEntry = createQuarantineEntry({ ...baseEntry, detail: "y".repeat(500) });
  assert.equal(longEntry.detail.length <= 200, true);
  assert.equal(longEntry.detail.length >= 1, true);
}

for (const [expectedPattern, mutate] of [
  [/razón de cuarentena no válida/, () => ({ reason: "unknown-reason" })],
  [/releaseTag de cuarentena no válido/, () => ({ releaseTag: "quality-history-202608" })],
  [/assetName de cuarentena no válido/, () => ({ assetName: "unit-test-diagnostics" })],
  [/releaseId de cuarentena no válido/, () => ({ releaseId: 12.5 })],
  [/assetId de cuarentena no válido/, () => ({ assetId: -1 })]
]) {
  assert.throws(() => createQuarantineEntry({ ...baseEntry, ...mutate() }), expectedPattern);
}

for (const [expectedPattern, mutate] of [
  [/no puede contener URLs/, () => ({ detail: "fallo en https://api.github.com/private" })],
  [/patrón que parece un token/, () => ({ detail: "leak ghp_ABCDEF1234567890abcdef" })],
  [/supera el límite/, () => ({ detail: "x".repeat(201) })],
  [/razón de cuarentena no válida/, () => ({ reason: "unknown-reason" })],
  [/releaseTag de cuarentena no válido/, () => ({ releaseTag: "quality-history-202608" })],
  [/assetName de cuarentena no válido/, () => ({ assetName: "unit-test-diagnostics" })],
  [/releaseId de cuarentena no válido/, () => ({ releaseId: 12.5 })],
  [/assetId de cuarentena no válido/, () => ({ assetId: -1 })]
]) {
  const manifest = manifestWith([rawEntry(mutate())]);
  assert.throws(() => validateQuarantineManifest(manifest), expectedPattern);
}

assert.throws(
  () => validateQuarantineManifest(manifestWith([], {})),
  /entries debe contener al menos una entrada/
);

assert.throws(
  () => validateQuarantineManifest(manifestWith([createQuarantineEntry(baseEntry)], { extra: true })),
  /no está permitido/
);

assert.deepEqual(
  [...QUARANTINE_REASONS].sort(),
  ["asset-id-mismatch", "download-failed", "invalid-json", "invalid-name", "invalid-snapshot"]
);

{
  const sanitized = sanitizeQuarantineDetail("error en https://example.invalid/token y ghp_ABCDEF1234567890abcdef");
  assert.equal(/https?:\/\//.test(sanitized), false);
  assert.equal(/ghp_/.test(sanitized), false);
}

const schema = JSON.parse(await readFile("schemas/quality-history-quarantine.schema.json", "utf8"));
assert.equal(schema.additionalProperties, false);
assert.equal(schema.properties.schemaVersion.const, 1);
assert.deepEqual(schema.properties.entries.minItems, 1);
assert.deepEqual(
  [...schema.$defs.entry.properties.reason.enum].sort(),
  ["asset-id-mismatch", "download-failed", "invalid-json", "invalid-name", "invalid-snapshot"]
);
assert.equal(schema.$defs.entry.additionalProperties, false);
assert.ok(schema.$defs.entry.properties.assetName.pattern.startsWith("^quality-snapshot-"));
assert.ok(schema.$defs.entry.properties.releaseTag.pattern.startsWith("^quality-history-"));

function historicalSnapshot({ gen = "2026-08-01T00:00:00.000Z" } = {}) {
  const snapshot = {
    schemaVersion: 1,
    identityVersion: 2,
    generatedAt: gen,
    dashboardCommitSha: "a".repeat(40),
    standard: { release: "v1.1.0", sha: "b".repeat(40) },
    repositories: [
      {
        id: "nexo",
        repository: "AlexFrigenti/Nexo",
        kind: "node",
        visibility: "private",
        notApplicableAreas: ["Tipos"],
        process: { overall: "warning", mainProtection: "pass", workflow: "pass", checks: [{ id: "latest-quality-run", status: "pending" }] },
        quality: {
          status: "pending",
          currentHeadSha: "c".repeat(40),
          message: "Evidencia pendiente para el commit actual.",
          gates: [],
          metrics: {}
        }
      }
    ]
  };
  snapshot.id = snapshotId(snapshot);
  return snapshot;
}

function asset(id, name) {
  return { id, name };
}

function fakeFetchJson({ releasesPages = [], assetsByRelease = {} } = {}) {
  return async (path) => {
    const query = path.split("?")[1] || "";
    const page = Number(new URLSearchParams(query).get("page"));
    if (path.includes("/releases?per_page=")) {
      return { ok: true, status: 200, data: releasesPages[page - 1] ?? [] };
    }
    const match = path.match(/\/releases\/(\d+)\/assets/);
    if (match) {
      const pages = assetsByRelease[match[1]] ?? [];
      return { ok: true, status: 200, data: pages[page - 1] ?? [] };
    }
    return { ok: false, status: 404, data: null };
  };
}

function collectWith({ releasesPages, assetsByRelease, fetchAssetBody, perPage = 2 }) {
  return collectQualityHistory({
    repository: "AlexFrigenti/project-quality",
    token: "test-token",
    deps: {
      fetchJson: fakeFetchJson({ releasesPages, assetsByRelease }),
      fetchAssetBody: fetchAssetBody ?? (async () => ({ ok: true, status: 200, text: "{}" })),
      perPage
    },
    now: new Date("2026-08-20T06:17:00.000Z")
  });
}

{
  const first = historicalSnapshot();
  const second = historicalSnapshot({ gen: "2026-07-01T00:00:00.000Z" });
  const laterPage = historicalSnapshot({ gen: "2026-06-01T00:00:00.000Z" });
  const bodiesByAssetId = { 11: first, 12: laterPage, 30: second };
  const result = await collectWith({
    releasesPages: [
      [{ id: 1, tag_name: "quality-history-2026-08" }, { id: 2, tag_name: "release-ajeno" }],
      [{ id: 3, tag_name: "quality-history-2026-07" }]
    ],
    assetsByRelease: {
      1: [[asset(10, "otro-artefacto.txt"), asset(11, `quality-snapshot-${first.id}.json`)], [asset(12, `quality-snapshot-${laterPage.id}.json`)]],
      3: [[asset(30, `quality-snapshot-${second.id}.json`)]]
    },
    fetchAssetBody: async (path) => {
      const match = path.match(/\/assets\/(\d+)$/);
      const snapshot = bodiesByAssetId[match[1]];
      return snapshot
        ? { ok: true, status: 200, text: JSON.stringify(snapshot) }
        : { ok: false, status: 404 };
    }
  });
  assert.equal(result.ok, true);
  assert.equal(result.quarantine, undefined);
  const ids = result.index.snapshots.map((snapshot) => snapshot.id);
  assert.ok(ids.includes(first.id), "El snapshot de la primera página debe estar en el índice.");
  assert.ok(ids.includes(second.id), "El snapshot del release en una página posterior debe descubrirse.");
  assert.ok(ids.includes(laterPage.id), "El snapshot de una página posterior de assets debe descubrirse.");
}

{
  const result = await collectWith({
    releasesPages: [[{ id: 1, tag_name: "quality-history-2026-08" }]],
    assetsByRelease: { 1: [[asset(10, `quality-snapshot-${"e".repeat(64)}.json`), asset(11, "otro-artefacto.txt")]] },
    fetchAssetBody: async () => ({ ok: true, status: 200, text: "{esto no es json" })
  });
  assert.equal(result.ok, false);
  assert.equal(result.index, undefined);
  assert.equal(result.quarantine.entries.length, 1);
  assert.equal(result.quarantine.entries[0].reason, "invalid-json");
  validateQuarantineManifest(result.quarantine);
}

{
  const good = historicalSnapshot();
  let requestedSecond = false;
  const result = await collectWith({
    releasesPages: [[{ id: 1, tag_name: "quality-history-2026-08" }]],
    assetsByRelease: { 1: [[asset(10, `quality-snapshot-${"e".repeat(64)}.json`), asset(11, `quality-snapshot-${good.id}.json`)]] },
    fetchAssetBody: async (path) => {
      if (path.endsWith("/assets/10")) return { ok: true, status: 200, text: "{corrupto" };
      requestedSecond = path.endsWith("/assets/11");
      return { ok: true, status: 200, text: JSON.stringify(good) };
    }
  });
  assert.equal(requestedSecond, true);
  assert.equal(result.ok, false);
  assert.equal(result.index, undefined);
  assert.equal(result.quarantine.entries.length, 1);
  assert.equal(result.quarantine.entries[0].reason, "invalid-json");
}

{
  const result = await collectWith({
    releasesPages: [[{ id: 1, tag_name: "quality-history-2026-08" }]],
    assetsByRelease: { 1: [[asset(10, `quality-snapshot-${"e".repeat(64)}.json`), asset(11, "otro-artefacto.txt")]] },
    fetchAssetBody: async () => ({ ok: false, status: 503 })
  });
  assert.equal(result.ok, false);
  const [entry] = result.quarantine.entries;
  assert.equal(entry.reason, "download-failed");
  assert.match(entry.detail, /503/);
  assert.equal(/https?:\/\//.test(entry.detail), false);
  validateQuarantineManifest(result.quarantine);
}

{
  const result = await collectWith({
    releasesPages: [[{ id: 1, tag_name: "quality-history-2026-08" }]],
    assetsByRelease: { 1: [[asset(10, "quality-snapshot-sin-hash.json"), asset(11, "otro-artefacto.txt")]] }
  });
  assert.equal(result.ok, false);
  assert.equal(result.quarantine.entries.length, 1);
  assert.equal(result.quarantine.entries[0].reason, "invalid-name");
  assert.equal(result.quarantine.entries[0].assetName, "quality-snapshot-sin-hash.json");
}

{
  const good = historicalSnapshot();
  const result = await collectWith({
    releasesPages: [[{ id: 1, tag_name: "quality-history-2026-08" }]],
    assetsByRelease: { 1: [[asset(10, `quality-snapshot-${"e".repeat(64)}.json`), asset(11, "otro-artefacto.txt")]] },
    fetchAssetBody: async () => ({ ok: true, status: 200, text: JSON.stringify(good) })
  });
  assert.equal(result.ok, false);
  assert.equal(result.quarantine.entries[0].reason, "asset-id-mismatch");
}

{
  const brokenSnapshot = { schemaVersion: 1 };
  const result = await collectWith({
    releasesPages: [[{ id: 1, tag_name: "quality-history-2026-08" }]],
    assetsByRelease: { 1: [[asset(10, `quality-snapshot-${"e".repeat(64)}.json`), asset(11, "otro-artefacto.txt")]] },
    fetchAssetBody: async () => ({ ok: true, status: 200, text: JSON.stringify(brokenSnapshot) })
  });
  assert.equal(result.ok, false);
  assert.equal(result.quarantine.entries[0].reason, "invalid-snapshot");
  validateQuarantineManifest(result.quarantine);
}

{
  let pagesSeen = 0;
  const endlessReleases = async (path) => {
    if (!path.includes("/releases?per_page=")) return { ok: true, status: 200, data: [] };
    pagesSeen += 1;
    return {
      ok: true,
      status: 200,
      data: [
        { id: pagesSeen * 10, tag_name: "quality-history-2026-0" + ((pagesSeen % 9) + 1) },
        { id: pagesSeen * 10 + 1, tag_name: "release-ajeno-" + pagesSeen }
      ]
    };
  };
  await assert.rejects(
    collectQualityHistory({
      repository: "AlexFrigenti/project-quality",
      token: "test-token",
      deps: {
        fetchJson: endlessReleases,
        fetchAssetBody: async () => ({ ok: true, status: 200, text: "{}" }),
        perPage: 2
      },
      now: new Date("2026-08-20T06:17:00.000Z")
    }),
    /límite de paginación/
  );
}

console.log("Contrato de cuarentena histórica válido.");
