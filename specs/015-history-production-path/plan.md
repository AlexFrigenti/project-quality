# Plan T2: PQ-OX16 — Cierre hermético de la ruta de producción

## Enfoque
- Partir de `ce2e43d` verificado, árbol limpio, sin código productivo nuevo en este commit.
- TDD por fases, RED antes de GREEN, refactorizar solo tras GREEN.
- Mantener identidad histórica, schemas y workflows fuera de alcance salvo la adición del nuevo test al pipeline.

## Fase 0 — Corrección de adaptadores GET (no reintento para POST)
- **Objetivo**: Que todo GET productivo use el adaptador resiliente común.
- **Archivos**: `scripts/github-api-request.mjs` (añadir `singleAttemptFetch` con timeout sin reintento, documentar no idempotencia), `scripts/collect-quality-history.mjs` (eliminar `defaultFetchJson`/`defaultFetchAssetBody` directos, construir `fetchJson`/`fetchAssetBody` resilientes sobre `deps.fetch` de bajo nivel), `scripts/persist-quality-history.mjs` (eliminar `githubRequest` directo, hacer que `resilientGetTag` y `findAssetResilient` usen `resilientFetch`/`withRetry` con `deps.fetch`), `scripts/history-pagination.mjs` (verificar que no importa `fetch`; recibe `fetchJson` ya resiliente).
- **Verificación**: pruebas 1,3,4,5,6,7,8,11.

## Fase 1 — Eliminación de fetch directos
- **Objetivo**: No debe quedar `fetch(` fuera de `github-api-request.mjs` en la ruta productiva del histórico.
- **Archivos**: los tres anteriores.
- **Verificación**: prueba estática 12 (`grep -r "fetch("` fuera del adaptador debe ser 0) + `node --check`.

## Fase 2 — Unificación de retry (una sola capa)
- **Objetivo**: Eliminar doble capa `resilientFetch ○ withRetry`.
- **Archivos**: `scripts/github-api-request.mjs` (definir contrato: un GET = una capa `withRetry` o `resilientFetch`, nunca ambas), `scripts/collect-quality-history.mjs` y `scripts/persist-quality-history.mjs` (elegir una: `withRetry` sobre operación que ya usa `resilientFetch` es doble; corregir a `singleAttemptFetch` para POST y a `resilientFetch`/`withRetry` único para GET).
- **Verificación**: prueba 11 (contador de `fetch` de bajo nivel == número de intentos esperados, no duplicado).

## Fase 3 — Pruebas del camino predeterminado
- **Objetivo**: Ejercitar producción sin `deps.request`/`deps.fetchJson`.
- **Archivos**: `scripts/test-history-production-path.mjs` (nuevo, 14 pruebas), `scripts/test-history-api-resilience.mjs` (mantener, debe seguir verde).
- **Pruebas**: 1-10 enumeradas en la spec, más 12-14; todas con `deps.fetch` únicamente y `sleep` a 0 ms.
- **Verificación**: RED contra base (faltan adaptadores) → GREEN tras Fases 0-2; `for file in scripts/test-*.mjs; do node "$file"; done` 14+ suites.

## Fase 4 — Integración del workflow
- **Archivos**: `.github/workflows/quality-dashboard.yml` (`pull_request.paths` y `push.paths` añaden `scripts/test-history-production-path.mjs`, `assemble` añade `node scripts/test-history-production-path.mjs`), `specs/015-history-production-path/*`, `QUALITY_HISTORY.md` (nota si procede).
- **Verificación**: `git diff --check`, `node --check`, schemas JSON, `git diff --stat` limitado a workflow + nuevo test + adaptadores.

## Dependencias y orden
- Fase 0 → Fases 1 y 2 → Fase 3 → Fase 4.

## Verificación global
- `node scripts/test-history-production-path.mjs` RED→GREEN + suites completas + `node --check` + schemas + `git diff --check` + revisión de `git diff` vs `ce2e43d`.

## Riesgos y mitigaciones
- Doble retry alarga jobs → una sola capa + cap 5s.
- `singleAttemptFetch` olvidado en POST → reintroduce retry ciego; prueba 9/10 lo detecta (contar intentos POST).
