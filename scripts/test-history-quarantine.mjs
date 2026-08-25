import assert from "node:assert/strict";
import { mkdtemp, readFile, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  QUARANTINE_REASONS,
  createQuarantineEntry,
  sanitizeQuarantineDetail,
  validateQuarantineManifest
} from "./history-quarantine.mjs";
import { CONTRACT_PATTERNS } from "./quality-contract.mjs";
import { collectQualityHistory, runHistoryCollection } from "./collect-quality-history.mjs";
import { listHistoryReleases, listReleaseAssets, PAGINATION_LIMITS } from "./history-pagination.mjs";
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
assert.equal(schema.$defs.entry.properties.releaseTag.pattern, CONTRACT_PATTERNS.historyReleaseTag, "schema y contrato comparten la regla mensual exacta.");
assert.deepEqual([...schema.$defs.entry.properties.releaseId.type].sort(), ["integer", "null"]);
assert.deepEqual([...schema.$defs.entry.properties.assetId.type].sort(), ["integer", "null"]);

{
  const nulled = createQuarantineEntry({ ...baseEntry, releaseId: null, assetId: null });
  assert.equal(nulled.releaseId, null);
  assert.equal(nulled.assetId, null);
  assert.doesNotThrow(() => validateQuarantineManifest(manifestWith([nulled])));
  const omitted = createQuarantineEntry(rawEntryOmittedIds());
  assert.equal(omitted.releaseId, null);
  assert.equal(omitted.assetId, null);

  for (const [expectedPattern, mutate] of [
    [/releaseId de cuarentena no válido/, () => ({ releaseId: "abc" })],
    [/assetId de cuarentena no válido/, () => ({ assetId: "abc" })]
  ]) {
    assert.throws(() => createQuarantineEntry({ ...baseEntry, ...mutate() }), expectedPattern);
  }

  assert.doesNotThrow(() => validateQuarantineManifest(manifestWith([rawEntry({ releaseId: null, assetId: null })])));
  assert.throws(
    () => validateQuarantineManifest(manifestWith([rawEntry({ assetId: "abc" })])),
    /assetId de cuarentena no válido/
  );
}

function rawEntryOmittedIds() {
  return {
    releaseTag: baseEntry.releaseTag,
    assetName: baseEntry.assetName,
    reason: baseEntry.reason,
    detail: baseEntry.detail
  };
}

for (const tag of ["quality-history-2026-01", "quality-history-2026-12"]) {
  assert.doesNotThrow(() => createQuarantineEntry({ ...baseEntry, releaseTag: tag }), tag);
}
for (const tag of ["quality-history-2026-00", "quality-history-2026-13"]) {
  assert.throws(
    () => createQuarantineEntry({ ...baseEntry, releaseTag: tag }),
    /releaseTag de cuarentena no válido/,
    tag
  );
  assert.throws(
    () => validateQuarantineManifest(manifestWith([rawEntry({ releaseTag: tag })])),
    /releaseTag de cuarentena no válido/,
    tag
  );
}

{
  assert.equal(/Bearer\s/.test(sanitizeQuarantineDetail("Authorization: Bearer abc123.def456")), false);
  const withQuery = sanitizeQuarantineDetail("https://private.example/path?token=ghp_abcdefghijklmnop");
  assert.equal(/https?:\/\//.test(withQuery), false);
  assert.equal(/token=/.test(withQuery), false);
  assert.equal(/ghp_/.test(sanitizeQuarantineDetail("ghp_sh")), false);
  const long = sanitizeQuarantineDetail("r".repeat(150) + " https://leak.invalid/a?secret=zzz");
  assert.equal(/https?:\/\//.test(long), false);
}

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

await assert.rejects(
  collectWith({
    releasesPages: [[{ id: 9, tag_name: "quality-history-2026-13" }]],
    assetsByRelease: {}
  }),
  /tag inválido/
);

{
  let bodyRequested = false;
  const result = await collectWith({
    releasesPages: [[{ id: 1, tag_name: "quality-history-2026-08" }]],
    assetsByRelease: { 1: [[{ name: `quality-snapshot-${"e".repeat(64)}.json` }, { id: "no-numérico", name: `quality-snapshot-${"d".repeat(64)}.json` }]] },
    fetchAssetBody: async () => {
      bodyRequested = true;
      return { ok: true, status: 200, text: "{}" };
    }
  });
  assert.equal(bodyRequested, false, "Nunca debe intentarse descargar un asset sin id válido.");
  assert.equal(result.ok, false);
  assert.equal(result.quarantine.entries.length, 2);
  for (const entry of result.quarantine.entries) {
    assert.equal(entry.reason, "download-failed");
    assert.equal(entry.assetId, null);
    assert.match(entry.detail, /Identificador de asset ausente o no numérico/);
  }
  assert.equal(JSON.stringify(result.quarantine).includes('"assetId":1'), false, "Nunca debe fabricarse el id 1.");
}

async function pageFetcherCases() {
  const release = { id: 1, tag_name: "quality-history-2026-08" };
  const full = [release, { id: 2, tag_name: "quality-history-2026-07" }];
  const partial = [release];

  {
    const seenPages = [];
    const releases = await listHistoryReleases("o/r", async (path) => {
      const page = Number(new URLSearchParams(path.split("?")[1]).get("page"));
      seenPages.push(page);
      return { ok: true, status: 200, data: pagesOf(page) };
      function pagesOf(p) {
        return p === 1 ? full : p === 2 ? partial : [];
      }
    }, { perPage: 2 });
    assert.equal(releases.length, 3, "Página llena seguida de incompleta: procesa todo.");
    assert.deepEqual(seenPages, [1, 2]);
  }

  {
    const pages = [];
    for (let p = 1; p <= PAGINATION_LIMITS.maxReleasePages; p += 1) {
      pages.push(p === PAGINATION_LIMITS.maxReleasePages ? partial : full);
    }
    const seenPages = [];
    const releases = await listHistoryReleases("o/r", async (path) => {
      const page = Number(new URLSearchParams(path.split("?")[1]).get("page"));
      seenPages.push(page);
      return { ok: true, status: 200, data: pages[page - 1] ?? [] };
    }, { perPage: 2 });
    assert.equal(seenPages.length, PAGINATION_LIMITS.maxReleasePages, "La página 100 incompleta termina con éxito.");
    assert.equal(releases.length, (PAGINATION_LIMITS.maxReleasePages - 1) * 2 + 1);
  }

  {
    const pages = [];
    for (let p = 1; p <= PAGINATION_LIMITS.maxReleasePages; p += 1) pages.push(full);
    await assert.rejects(
      listHistoryReleases("o/r", async (path) => {
        const page = Number(new URLSearchParams(path.split("?")[1]).get("page"));
        return { ok: true, status: 200, data: pages[page - 1] ?? [] };
      }, { perPage: 2 }),
      /límite de paginación/
    );
  }

  for (const badData of [null, "texto", { no: "array" }]) {
    await assert.rejects(
      listHistoryReleases("o/r", async () => ({ ok: true, status: 200, data: badData }), { perPage: 2 }),
      /releases históricos no es válida/
    );
    await assert.rejects(
      listReleaseAssets("o/r", release, async () => ({ ok: true, status: 200, data: badData }), { perPage: 2 }),
      /assets del release 1 no es válida/
    );
  }

  await assert.rejects(
    listHistoryReleases("o/r", async () => ({ ok: false, status: 500 }), { perPage: 2 }),
    /No se pudo consultar el histórico persistente/
  );
  await assert.rejects(
    listReleaseAssets("o/r", release, async () => ({ ok: false, status: 500 }), { perPage: 2 }),
    /No se pudieron consultar los assets/
  );

  function assetPageFetcher(pages) {
    return async (path) => {
      const page = Number(new URLSearchParams(path.split("?")[1]).get("page"));
      return { ok: true, status: 200, data: pages[page - 1] ?? [] };
    };
  }
  {
    const assets = await listReleaseAssets("o/r", release, assetPageFetcher([full, partial]), { perPage: 2 });
    assert.equal(assets.length, 3, "Assets: página llena seguida de incompleta procesa todo.");
  }
  {
    const pages = [];
    for (let p = 1; p <= PAGINATION_LIMITS.maxAssetPages; p += 1) pages.push(p === PAGINATION_LIMITS.maxAssetPages ? partial : full);
    const assets = await listReleaseAssets("o/r", release, assetPageFetcher(pages), { perPage: 2 });
    assert.equal(assets.length, (PAGINATION_LIMITS.maxAssetPages - 1) * 2 + 1, "Página 100 de assets incompleta termina con éxito.");
  }
  {
    const pages = [];
    for (let p = 1; p <= PAGINATION_LIMITS.maxAssetPages; p += 1) pages.push(full);
    await assert.rejects(
      listReleaseAssets("o/r", release, assetPageFetcher(pages), { perPage: 2 }),
      /límite de paginación/
    );
  }
}

{
  const siteDir = await mkdtemp(join(tmpdir(), "pq-ox07-stale-"));
  try {
    const staleHistoryPath = join(siteDir, "history.json");
    await writeFile(staleHistoryPath, "{\"stale\":true}\n");

    const currentSnapshot = historicalSnapshot();
    const result = await runHistoryCollection({
      siteDir,
      repository: "AlexFrigenti/project-quality",
      token: "test-token",
      currentSnapshot,
      deps: {
        fetchJson: fakeFetchJson({
          releasesPages: [[{ id: 1, tag_name: "quality-history-2026-08" }]],
          assetsByRelease: { 1: [[asset(10, `quality-snapshot-${"e".repeat(64)}.json`)]] }
        }),
        fetchAssetBody: async () => ({ ok: true, status: 200, text: "{corrupto" })
      },
      now: new Date("2026-08-20T06:17:00.000Z")
    });

    assert.equal(result.ok, false);
    const quarantine = JSON.parse(await readFile(join(siteDir, "history-quarantine.json"), "utf8"));
    validateQuarantineManifest(quarantine);
    let staleGone = false;
    try {
      await readFile(staleHistoryPath);
    } catch {
      staleGone = true;
    }
    assert.equal(staleGone, true, "El history.json antiguo no debe quedar utilizable tras un fallo.");
  } finally {
    await rm(siteDir, { recursive: true, force: true });
  }
}

{
  const siteDir = await mkdtemp(join(tmpdir(), "pq-ox07-ok-"));
  try {
    const good = historicalSnapshot();
    const result = await runHistoryCollection({
      siteDir,
      repository: "AlexFrigenti/project-quality",
      token: "test-token",
      currentSnapshot: good,
      deps: {
        fetchJson: fakeFetchJson({
          releasesPages: [[{ id: 1, tag_name: "quality-history-2026-08" }]],
          assetsByRelease: { 1: [[asset(10, `quality-snapshot-${good.id}.json`)]] }
        }),
        fetchAssetBody: async () => ({ ok: true, status: 200, text: JSON.stringify(good) })
      },
      now: new Date("2026-08-20T06:17:00.000Z")
    });
    assert.equal(result.ok, true);
    const index = JSON.parse(await readFile(join(siteDir, "history.json"), "utf8"));
    assert.ok(index.snapshots.length >= 1);
    let quarantineWritten = false;
    try {
      await readFile(join(siteDir, "history-quarantine.json"));
      quarantineWritten = true;
    } catch {}
    assert.equal(quarantineWritten, false, "Sin corrupción no debe escribirse manifest de cuarentena.");
  } finally {
    await rm(siteDir, { recursive: true, force: true });
  }
}

{
  const workflowText = await readFile(".github/workflows/quality-dashboard.yml", "utf8");
  const assembleStart = workflowText.indexOf("Assemble dashboard");
  const deployStart = workflowText.indexOf("Deploy dashboard to Pages");
  assert.ok(assembleStart > -1 && deployStart > assembleStart);
  const assembleSection = workflowText.slice(assembleStart, deployStart);
  assert.equal(/continue-on-error/.test(assembleSection), false, "Ningún continue-on-error puede ocultar el fallo del collector.");
  assert.match(assembleSection, /Upload history quarantine manifest/);
  assert.match(assembleSection, /if: always\(\)/);
  assert.match(assembleSection, /if-no-files-found: ignore/);
  assert.match(assembleSection, /site\/history-quarantine\.json/);
  assert.equal(/path:\s*["']?site\/history\.json/.test(workflowText), false, "history.json nunca se sube como artifact propio.");
  const guardMatches = workflowText.match(/needs\.assemble\.result == 'success'/g) || [];
  assert.ok(guardMatches.length >= 2, "Los guards de history y deploy deben permanecer intactos.");
}

async function expectStaleHistoryQuarantined({ deps, expectThrow, quarantineExpected }) {
  const siteDir = await mkdtemp(join(tmpdir(), "pq-ox07-matrix-"));
  try {
    const historyPath = join(siteDir, "history.json");
    await writeFile(historyPath, "{\"stale\":true}\n");
    const params = {
      siteDir,
      repository: "AlexFrigenti/project-quality",
      token: "test-token",
      currentSnapshot: historicalSnapshot(),
      deps,
      now: new Date("2026-08-20T06:17:00.000Z")
    };
    if (expectThrow) {
      await assert.rejects(runHistoryCollection(params), expectThrow);
    } else {
      const result = await runHistoryCollection(params);
      assert.equal(result.ok, false);
    }
    let historyUsable = false;
    try {
      const content = JSON.parse(await readFile(historyPath, "utf8"));
      historyUsable = Boolean(content && typeof content === "object");
    } catch {
      historyUsable = false;
    }
    assert.equal(historyUsable, false, "El histórico stale no puede quedar utilizable tras un fallo.");
    let quarantine = null;
    try {
      quarantine = JSON.parse(await readFile(join(siteDir, "history-quarantine.json"), "utf8"));
    } catch {}
    if (quarantineExpected) {
      assert.ok(quarantine, "Debe existir manifest de cuarentena.");
      validateQuarantineManifest(quarantine);
    } else {
      assert.equal(quarantine, null, "Los errores fatales de metadatos no generan manifest de assets.");
    }
  } finally {
    await rm(siteDir, { recursive: true, force: true });
  }
}

const failingStaleCases = [
  {
    name: "tag mensual inválido",
    expectThrow: /tag inválido/,
    quarantineExpected: false,
    deps: () => ({
      fetchJson: fakeFetchJson({ releasesPages: [[{ id: 9, tag_name: "quality-history-2026-13" }]] }),
      fetchAssetBody: async () => ({ ok: true, status: 200, text: "{}" })
    })
  },
  {
    name: "release sin id",
    expectThrow: /sin identificador válido/,
    quarantineExpected: false,
    deps: () => ({
      fetchJson: fakeFetchJson({ releasesPages: [[{ tag_name: "quality-history-2026-08" }]] }),
      fetchAssetBody: async () => ({ ok: true, status: 200, text: "{}" })
    })
  },
  {
    name: "respuesta API malformada",
    expectThrow: /releases históricos no es válida/,
    quarantineExpected: false,
    deps: () => ({
      fetchJson: async () => ({ ok: true, status: 200, data: null }),
      fetchAssetBody: async () => ({ ok: true, status: 200, text: "{}" })
    })
  },
  {
    name: "error HTTP listando releases",
    expectThrow: null,
    quarantineExpected: false,
    deps: () => ({
      fetchJson: async () => ({ ok: false, status: 503, headers: { get: () => null, has: () => false }, data: null }),
      fetchAssetBody: async () => ({ ok: true, status: 200, text: "{}" })
    })
  },
  {
    name: "error HTTP en búsqueda global de persistencia no aplica; límite de paginación",
    expectThrow: /límite de paginación/,
    quarantineExpected: false,
    deps: () => {
      let page = 0;
      return {
        fetchJson: async (path) => {
          if (!path.includes("/releases?per_page=")) return { ok: true, status: 200, data: [] };
          page += 1;
          return {
            ok: true,
            status: 200,
            data: [
              { id: page * 10, tag_name: "quality-history-2026-0" + ((page % 9) + 1) },
              { id: page * 10 + 1, tag_name: "release-ajeno-" + page }
            ]
          };
        },
        fetchAssetBody: async () => ({ ok: true, status: 200, text: "{}" }),
        perPage: 2
      };
    }
  },
  {
    name: "fallo descargando un asset",
    expectThrow: null,
    quarantineExpected: true,
    deps: () => ({
      fetchJson: fakeFetchJson({
        releasesPages: baseReleasesPage(),
        assetsByRelease: { 1: [[asset(10, `quality-snapshot-${"e".repeat(64)}.json`)]] }
      }),
      fetchAssetBody: async () => ({ ok: false, status: 503 })
    })
  },
  {
    name: "snapshot inválido",
    expectThrow: null,
    quarantineExpected: true,
    deps: () => ({
      fetchJson: fakeFetchJson({
        releasesPages: baseReleasesPage(),
        assetsByRelease: { 1: [[asset(10, `quality-snapshot-${"e".repeat(64)}.json`)]] }
      }),
      fetchAssetBody: async () => ({ ok: true, status: 200, text: "{}" })
    })
  }
];

function baseReleasesPage() {
  return [[{ id: 1, tag_name: "quality-history-2026-08" }]];
}

for (const failingCase of failingStaleCases) {
  await expectStaleHistoryQuarantined({
    deps: failingCase.deps(),
    expectThrow: failingCase.expectThrow,
    quarantineExpected: failingCase.quarantineExpected
  });
}

{
  const first = historicalSnapshot();
  let bodyCalls = 0;
  await assert.rejects(
    collectWith({
      releasesPages: [
        [{ id: 1, tag_name: "quality-history-2026-08" }, { id: 2, tag_name: "quality-history-2026-07" }],
        [{ id: 3, tag_name: "quality-history-2026-13" }]
      ],
      assetsByRelease: {
        1: [[asset(11, `quality-snapshot-${first.id}.json`)]],
        2: [],
        3: []
      },
      fetchAssetBody: async () => {
        bodyCalls += 1;
        return { ok: true, status: 200, text: JSON.stringify(first) };
      }
    }),
    /tag inválido/
  );
  assert.equal(bodyCalls, 0, "El aborto por tag inválido ocurre antes de descargar cualquier asset.");
}

{
  const siteDir = await mkdtemp(join(tmpdir(), "pq-ox07-releaseid-"));
  try {
    await writeFile(join(siteDir, "history.json"), "{\"stale\":true}\n");
    await assert.rejects(
      runHistoryCollection({
        siteDir,
        repository: "AlexFrigenti/project-quality",
        token: "test-token",
        currentSnapshot: historicalSnapshot(),
        deps: {
          fetchJson: fakeFetchJson({ releasesPages: [[{ tag_name: "quality-history-2026-08" }]] }),
          fetchAssetBody: async () => ({ ok: true, status: 200, text: "{}" })
        },
        now: new Date("2026-08-20T06:17:00.000Z")
      }),
      /Release histórico sin identificador válido: quality-history-2026-08/
    );
    let remaining = null;
    try {
      remaining = JSON.parse(await readFile(join(siteDir, "history.json"), "utf8"));
    } catch {}
    assert.equal(remaining, null, "Sin history.json residual utilizable.");
    let manifest = null;
    try {
      manifest = JSON.parse(await readFile(join(siteDir, "history-quarantine.json"), "utf8"));
    } catch {}
    assert.equal(manifest, null, "Error fatal de metadatos: sin manifest con ids fabricados.");
  } finally {
    await rm(siteDir, { recursive: true, force: true });
  }
}

console.log("Contrato de cuarentena histórica válido.");
