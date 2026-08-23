import { CONTRACT_REGEXP } from "./quality-contract.mjs";

export const PAGINATION_LIMITS = Object.freeze({
  maxReleasePages: 100,
  maxAssetPages: 100,
  perPage: 100
});

function fail(message) {
  throw new Error(message);
}

async function listAllPages({ fetchPage, maxPages, perPage, label }) {
  const items = [];
  for (let page = 1; page <= maxPages; page += 1) {
    const batch = await fetchPage(page);
    if (!Array.isArray(batch)) fail("La lista de " + label + " no es válida.");
    items.push(...batch);
    if (batch.length < perPage) return items;
  }
  fail(
    "Se alcanzó el límite de paginación de " + label
    + " (" + maxPages + " páginas); se aborta para nunca truncar silenciosamente."
  );
}

export async function listHistoryReleases(repository, fetchJson, { perPage = PAGINATION_LIMITS.perPage } = {}) {
  const releases = await listAllPages({
    label: "releases históricos",
    maxPages: PAGINATION_LIMITS.maxReleasePages,
    perPage,
    fetchPage: async (page) => {
      const response = await fetchJson("/repos/" + repository + "/releases?per_page=" + perPage + "&page=" + page);
      if (!response.ok) fail("No se pudo consultar el histórico persistente.");
      return response.data;
    }
  });
  for (const release of releases) {
    const tag = release?.tag_name || "";
    if (!tag.startsWith("quality-history-")) continue;
    if (!CONTRACT_REGEXP.historyReleaseTag.test(tag)) {
      fail("Release histórico con tag inválido: " + tag);
    }
  }
  return releases
    .filter((release) => CONTRACT_REGEXP.historyReleaseTag.test(release?.tag_name || ""))
    .sort((left, right) => {
      const leftDate = Date.parse(left.published_at || left.created_at || "") || 0;
      const rightDate = Date.parse(right.published_at || right.created_at || "") || 0;
      return rightDate - leftDate;
    });
}

export async function listReleaseAssets(repository, release, fetchJson, { perPage = PAGINATION_LIMITS.perPage } = {}) {
  return listAllPages({
    label: "assets del release " + release.id,
    maxPages: PAGINATION_LIMITS.maxAssetPages,
    perPage,
    fetchPage: async (page) => {
      const response = await fetchJson(
        "/repos/" + repository + "/releases/" + release.id + "/assets?per_page=" + perPage + "&page=" + page
      );
      if (!response.ok) fail("No se pudieron consultar los assets de un release histórico.");
      return response.data;
    }
  });
}
