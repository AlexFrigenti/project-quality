# Especificación: PQ-OX17 — Retry único en la ruta productiva del histórico

## Contexto y evidencia exacta del doble retry

En `main` después de PQ-OX16 (`d98667b`):

**`scripts/collect-quality-history.mjs` (líneas 142-166):**
```js
const fetchJson = (path) => withRetry(() => baseFetchJson(path), deps);
...
for (const release of await listHistoryReleases(repo, fetchJson, { perPage })) {
```
`listHistoryReleases` internamente hace `fetchJson("/repos/.../releases?...")` donde `fetchJson` ya está envuelto en `withRetry`. Pero `listHistoryReleases` → `listAllPages` → `fetchPage` → `fetchJson` → `withRetry`. Y `fetchJson` ya es `withRetry(baseFetchJson)`. Resultado: `withRetry(withRetry(baseFetchJson))` → 3×3 = hasta 9 llamadas de bajo nivel si el primer intento es 503.

**`scripts/persist-quality-history.mjs`:**
- `resilientGetTag` → `withRetry(() => deps.request(...) || resilientFetch(...))` donde `resilientFetch` ya hace 3 intentos.
- `findAssetResilient` → `fetchJson = (path) => withRetry(() => baseFetchJson(path), deps)` y luego `listHistoryReleases(repo, fetchJson)` que también hace `withRetry` internamente si se usara la misma envoltura (actualmente no lo hace para el caso productivo con `deps.fetch`, pero la composición existe en `collect` y en `persist` para `resilientGetTag`).

**Prueba actual “nunca 9”:** `scripts/test-history-production-path.mjs` (si existe) o el comentario en `test-history-api-resilience` prueba `withRetry` aislado con `deps.fetch` directo, sin pasar por la composición `withRetry(resilientFetch)`. Por tanto, no detecta el doble retry productivo.

## Objetivo

Cada GET productivo del histórico debe tener **exactamente una política de retry**:

- máximo 3 llamadas de bajo nivel (`maxAttempts=3`);
- timeout 10s, backoff 250/1000 cap 5s, `Retry-After` y `X-RateLimit-Reset` conservados;
- sin retry para errores definitivos (401,404,422, otros 4xx no rate-limit);
- sin doble composición `withRetry(resilientFetch(...))`;
- los seams de test de alto nivel (`deps.fetchJson`, `deps.request`) deben conservar su comportamiento (ya son resilientes o no, según inyección);
- el camino productivo real con solo `deps.fetch` (sin `deps.fetchJson`/`deps.request`) debe quedar cubierto y verificado.

## Invariantes

- `resilientFetch` es la única implementación de retry para `fetch` de bajo nivel.
- `withRetry` es un wrapper genérico para operaciones que retornan `{ok, status}` y no debe envolver a `resilientFetch` en la ruta productiva.
- `singleAttemptFetch` para POST mantiene una sola tentativa con timeout, sin `withRetry`.
- Límite de dos POST por operación de reconciliación se preserva.
- Paginación, `snapshotId`, identidad, retención y nombres de assets sin cambios.

## Diferencia entre caminos

- **Camino productivo con `deps.fetch`**: `deps.fetch` es el `fetch` de bajo nivel. Debe envolverse **una sola vez** con `resilientFetch` (o `withRetry` con `fetch` directo, pero no ambos). La implementación actual hace `withRetry(() => resilientFetch(...))` → doble.
- **Seams inyectados (`deps.fetchJson`, `deps.request`)**: Son operaciones de alto nivel que ya retornan `{ok, status, data}` y pueden ser o no resilientes según el test. `withRetry` sobre ellos es correcto y debe preservarse. No se debe eliminar `withRetry` para estos seams.
- **POST**: `singleAttemptFetch` (una tentativa) nunca debe envolverse con `withRetry`.

## Alcance

Incluye:
- Corrección de `collectQualityHistory` para que `fetchJson`/`fetchAssetBody` productivos usen `resilientFetch` directamente sin `withRetry` adicional.
- Corrección de `persist` para que `resilientGetTag` y `findAssetResilient` usen `resilientFetch` directo cuando no hay `deps.request`, y `withRetry` solo cuando hay `deps.request`/`deps.fetchJson` inyectado.
- Pruebas de regresión sobre los caminos productivos con `deps.fetch` (503×3 → exactamente 3 llamadas).

Fuera de alcance:
- Cambiar `singleAttemptFetch`, límite de dos POST, paginación, `snapshotId`, schemas, retención, nombres de assets, semántica histórica, workflows, dependencias.

## Compatibilidad

- **PQ-OX15**: La resiliencia para GET (3 intentos, timeout, backoff, Retry-After/X-RateLimit-Reset) se preserva idéntica; solo se elimina la duplicación.
- **PQ-OX16**: La ruta productiva de `collect` y `persist` con `deps.fetch` ahora es la única cubierta; los tests existentes con `deps.fetchJson`/`deps.request` siguen pasando sin cambios.
- **POST**: Una sola tentativa y límite de dos POST en reconciliación se preservan sin cambios.

## Criterios de aceptación

- [ ] Un GET productivo con `503×3` usando solo `deps.fetch` hace exactamente 3 llamadas de bajo nivel, no 9.
- [ ] Un GET productivo con `503×3` seguido de éxito en `persistSnapshot` hace exactamente 3 llamadas.
- [ ] `Retry-After` y `X-RateLimit-Reset` siguen funcionando en la ruta productiva.
- [ ] Los GET definitivos (401,404,422) no reintentan (1 llamada).
- [ ] Los POST mantienen una sola tentativa; la reconciliación no supera dos POST.
- [ ] Los seams inyectados (`deps.fetchJson`, `deps.request`) conservan su comportamiento (con `withRetry`).
- [ ] Las 18 suites existentes y las nuevas regresiones pasan.
- [ ] No hay `withRetry(resilientFetch(` en el código productivo.

## Riesgos y reversión

- **Riesgo**: Eliminar una capa de retry podría exponer un caso donde el retry era necesario en el seam inyectado. Mitigado: se conserva `withRetry` para `deps.fetchJson`/`deps.request`; solo se elimina la doble envoltura productiva.
- **Riesgo**: Cambio sutil en el orden de `sleep`/`now`/`config` inyección. Mitigado: pruebas con `sleep` y `now` inyectados verifican el backoff.
- **Reversión**: Revertir el commit restaura la doble envoltura; no hay migración de datos.
