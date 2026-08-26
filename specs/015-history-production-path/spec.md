# Especificación T2: PQ-OX16 — Cierre hermético de la ruta de producción del histórico

## Clasificación
- **T2** — Corrección de discrepancia entre contrato resiliente y ruta productiva real. Requiere spec, plan, tasks, decisiones, riesgos y compatibilidad. Sin cambios de esquema ni migración.
- **Estado**: Spec-only. Implementación no iniciada en este commit.

## Problema verificable
En `ce2e43d` (`origin/main`) la resiliencia definida en la spec de PQ-OX15 existe en `scripts/github-api-request.mjs` y es ejercitada por `scripts/persist-quality-history.mjs` solo cuando el test inyecta `deps.request`/`deps.fetchJson`, pero **no** por los adaptadores predeterminados que usa el workflow real:

- `scripts/collect-quality-history.mjs:28` `defaultFetchJson()` y `:39` `defaultFetchAssetBody()` ejecutan `fetch(API_ROOT + path, { headers })` directo.
- `scripts/persist-quality-history.mjs:333` `githubRequest()` ejecuta `fetch(apiUrl(path), ...)` directo.
- `scripts/persist-quality-history.mjs:355` `getOrCreateRelease()` invoca `githubRequest` directo cuando `!deps.request`; idem `findAssetResilient:68` y `uploadAsset:437` con `fetch` directo.
- `scripts/history-pagination.mjs` delega en `fetchJson` recibido; en producción es el `defaultFetchJson` directo, por lo que paginación hereda la misma falta de resiliencia.

Consecuencia: `npm test` puede pasar inyectando `deps.request`/`deps.fetchJson` resilientes sin que el binario que ejecuta `quality-dashboard.yml` haya sido probado.

## Evidencia en los archivos actuales
- `collect-quality-history.mjs:141-144` crea `baseFetchJson/baseFetchAssetBody` que cierran sobre `defaultFetchJson/defaultFetchAssetBody` directos y luego los envuelve con `withRetry`; sin embargo el `fetch` subyacente sigue siendo directo.
- `persist-quality-history.mjs:12` importa `withRetry, singleAttemptFetch, resilientFetch` pero `githubRequest:334`, `uploadAsset:437` y las dos ramas `findAssetResilient`/`resilientGetTag` caen a `resilientFetch` solo en el `else` de `if (deps.request)`, dejando la ruta productiva (sin `deps.request`) bajo `singleAttemptFetch`/`githubRequest` directo.
- `history-pagination.mjs` no importa ningún helper resiliente; depende del `fetchJson` que se le pase.

## Hallazgo adicional: doble capa de retry
Análisis de `persist-quality-history.mjs:352-354` y `github-api-request.mjs:101-146`:
- `resilientGetTag()` construye `operation = () => request(...)` donde `request` ya es `githubRequest` directo; luego `withRetry(operation)` añade capa 1.
- `collect-quality-history.mjs:143-144` hace `baseFetchJson -> withRetry` y `listHistoryReleases` internamente no reintenta, pero `withRetry` externo ya reintenta. Si además `resilientFetch` interno reintentara, habría doble conteo.
- En la práctica, la doble capa potencial es `resilientFetch (3 intentos) ∘ withRetry (3 intentos)` = hasta 9 intentos para un mismo GET si ambas capas estuvieran activas.
- La spec debe definir **una sola capa de retry por GET** (el adaptador resiliente común) y que `singleAttemptFetch` no reintente nunca.

## Objetivo
Cerrar la discrepancia seams/test vs producción sin añadir funcionalidad de usuario: todos los GET productivos del histórico deben pasar por **un adaptador resiliente común**; cuerpos de assets también con timeout/reintentos/sanitización; POST exclusivamente vía `singleAttemptFetch`; reconciliación PQ-OX15 intacta.

## Arquitectura objetivo
- **Adaptador único**: `scripts/github-api-request.mjs` expone `resilientFetch` (GET resiliente, 3 intentos, 10s timeout, backoff 250/1000 cap 5s, `Retry-After` > `X-RateLimit-Reset`) y `singleAttemptFetch` (1 tentativa con timeout, sin retry). Ningún otro fichero importa `fetch` directo para el histórico.
- `scripts/history-pagination.mjs`: no toca `fetch`; recibe `fetchJson` ya resiliente desde el llamante.
- `scripts/collect-quality-history.mjs`: elimina `defaultFetchJson`/`defaultFetchAssetBody` directos; construye `fetchJsonResiliente = (path)=> withRetrySingle?` vía `resilientFetch` con `fetch` de bajo nivel inyectable (`deps.fetch`). `deps.fetch` de bajo nivel es el único seam para probar producción; `deps.fetchJson/deps.fetchAssetBody` se mantienen como atajos legados pero delegan al mismo adaptador.
- `scripts/persist-quality-history.mjs`: elimina `githubRequest` directo; todo `GET` (releases paginados, assets paginados, tag exacto, listado global) usa `resilientFetch`/`withRetry` con `fetch` de bajo nivel; `POST` usa `singleAttemptFetch`; `uploadAsset` migra a `singleAttemptFetch`.
- `scripts/github-api-request.mjs` documenta por qué `singleAttemptFetch` no reintenta (no idempotencia).

## Límites de retry y timeout
- `maxAttempts: 3`, `timeoutMs: 10000` por intento vía `AbortController`, `backoffMs: [250,1000]`, `maxDelayMs: 5000`.
- `Retry-After` (segundos o fecha HTTP) tiene prioridad; si no válido, `X-RateLimit-Reset` (unix s); si no, `backoffMs[attempt]`; siempre capado a `maxDelayMs`.
- Reintentos solo para red/`AbortError`, `408`, `429`, `500`, `502`, `503`, `504`, `403` con `x-ratelimit-remaining: 0`.

## Semántica de errores
- GET resiliente: `401`, `404`, `422` y otros `4xx` definitivos → no reintento, retorno directo para que la capa superior decida fail-closed o cuarentena.
- POST `404` del propio POST nunca prueba ausencia (ver reconciliación).
- Tras agotar reintentos GET: colección no genera índice parcial, elimina `history.json` stale, no publica `history.json`; cuarentena si aplica.
- Diagnósticos sanitizados a ≤200 chars, sin tokens/`Authorization`/cuerpos/URLs sensibles; tipo `rate-limit`/`timeout`/`transient`/`http`/`network`.

## Estrategia de inyección
- **Producción**: `deps.fetch` de bajo nivel (`fetch` global) inyectable para probar la ruta predeterminada. Cuando no se inyecta, se usa `globalThis.fetch`.
- **Seams existentes**: `deps.request`, `deps.upload`, `deps.fetchJson`, `deps.fetchAssetBody` se conservan para compatibilidad, pero su implementación productiva por defecto debe delegar al adaptador común; los tests no deben asumir que probar un seam equivale a probar producción.
- **Pruebas**: herméticas, sin red real, con `fetch`/`sleep`/`now`/`config` inyectados (`sleep` a 0 ms).

## Matriz de pruebas (14) — RED→GREEN herméticas por camino predeterminado
1. `collectQualityHistory` con `deps.fetch` únicamente (sin `deps.fetchJson`) — GET resiliente ejercitado.
2. `persistSnapshot` con `deps.fetch` únicamente — GET resiliente ejercitado.
3. GET releases con timeout y reintento → éxito en 2º intento.
4. GET con `429` respetando `Retry-After` (2026-08-20T06:17:00Z, delay 1s) → 2 llamadas, `sleep≈1000`.
5. GET con `403` + `X-RateLimit-Reset` → delay calculado, capado.
6. GET `404` de release con cuerpo JSON válido → ausencia concluyente (no reintento, habilita 2º POST).
7. GET `404` con cuerpo inválido → estado no concluyente (fail-closed, sin 2º POST).
8. Descarga de asset con timeout y reintento → cuerpo JSON válido.
9. POST release con una única tentativa (verificar `maxAttempts` del POST =1).
10. POST asset con una única tentativa.
11. GET no puede provocar retries duplicados (doble capa) — contar `fetch` de bajo nivel.
12. Verificación estática: ningún `fetch(` directo en `collect-`, `persist-`, `history-pagination.mjs` fuera del adaptador.
13. `singleAttemptFetch` no reintenta (3× `503` → 1 llamada).
14. Límite máximo dos POST + reconciliación PQ-OX15 intacta (casos 3-6 de la spec 014).

## Criterios de aceptación
- [ ] Ningún GET productivo del histórico usa `fetch` directo fuera de `github-api-request.mjs`.
- [ ] `singleAttemptFetch` existe, documentado y usado exclusivamente por ambos POST.
- [ ] Cada nueva prueba 1-14 falla contra la base (RED) por la ausencia del adaptador y pasa tras el fix (GREEN).
- [ ] `withRetry`/`resilientFetch` se invoca exactamente una vez por GET (no doble capa).
- [ ] `maxAttempts=3`, `timeoutMs=10000`, `backoff 250/1000` cap `5000`, `Retry-After`/`X-RateLimit-Reset` respetados.
- [ ] Ausencia concluyente y estado incierto respetan la semántica endpoint-específica de la spec 014.
- [ ] Límite absoluto 2 POST por operación, sin tercer POST, sin `DELETE`/`PUT`/`PATCH`, sin reemplazo.
- [ ] Paginación PQ-OX12, `snapshotId`, identidad v1/v2, schemas, retención y nombres de assets intactos.
- [ ] `deps.request` y `deps.upload` siguen funcionando (compatibilidad).

## Compatibilidad
- No cambia `schemas/*.json`, `snapshotId` ni `schemaVersion`.
- No cambia retención/pruning ni nombres de assets.
- `deps` existentes siguen aceptados; solo se añade `deps.fetch` de bajo nivel como camino principal.

## Riesgos
- Mover todos los GET al adaptador aumenta el tiempo de job en caso de `429` con `Retry-After` grande → mitigado por cap 5s.
- `singleAttemptFetch` expone timeouts de POST como errores transitorios reconciliables; si se confunde con `resilientFetch` se reintroduciría doble retry.

## Estrategia de reversión
- Revertir el commit de implementación restaura `defaultFetchJson` directos; no hay migración de datos. Los tests de camino predeterminado volverían a RED, señalando la regresión.

## Fuera de alcance
- Cambios de esquema, `snapshotId`, identidad, migraciones, retención/pruning.
- Cambios de workflow salvo añadir las nuevas pruebas contractuales a `pull_request.paths`/`push.paths` y ejecutarlas en `assemble`.
- Nueva interfaz de usuario, dashboard, gobernanza de `main`, reintentos para POST, ZIP64, eliminación automática de assets corruptos.
