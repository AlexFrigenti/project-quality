# Especificación T2: PQ-OX15 — Resiliencia segura de la API del histórico

## Clasificación
- **T2** — Afecta a datos persistentes, pipeline de histórico y contrato fail-closed. Requiere spec, plan, tasks, decisiones, riesgos, invariantes y compatibilidad.
- **Estado**: Especificación aprobada. Implementación no iniciada en este commit.

## Contexto confirmado sobre `main` (`ed87b44fa9fc6ecaf547ed8911b153cff5234a92`)
- `scripts/collect-quality-history.mjs` usa `fetch` directo sin reintentos para listar releases, listar assets y descargar cuerpos.
- `scripts/persist-quality-history.mjs` usa `fetch` directo para consultar/crear releases y subir assets.
- `scripts/github-api-request.mjs` existe y define la política aprobada: máximo 3 intentos, timeout 10s, backoff 250 ms / 1000 ms capado a 5s, respeto a `Retry-After` y `X-RateLimit-Reset`, reintentos solo para red, timeout, 408, 429, 500, 502, 503, 504 y 403 con `x-ratelimit-remaining: 0`.
- No existe resiliencia integrada en el pipeline de histórico; los fallos transitorios actuales abortan como `unavailable` sin reintento, y los POST no tienen reconciliación.

## Objetivo
Aplicar resiliencia acotada al pipeline de histórico (`collect` y `persist`) sin convertir una respuesta incierta de GitHub en duplicados, sustituciones o falsos éxitos. Toda incertidumbre tras agotar la política debe conservar el comportamiento fail-closed existente.

## 1. Lecturas GET — alcance y contrato

### Endpoints
- Listado paginado de releases (`GET /repos/{owner}/{repo}/releases?per_page=100&page=N`, filtrado `quality-history-YYYY-MM`).
- Listado paginado de assets por release (`GET /repos/{owner}/{repo}/releases/{id}/assets?per_page=100&page=N`).
- Consulta de release por tag (`GET /repos/{owner}/{repo}/releases/tags/{tag}`).
- Descarga del contenido de un asset (`GET /repos/{owner}/{repo}/releases/assets/{asset_id}` con `Accept: application/octet-stream`).

### Política
- Cada GET se ejecuta a través del helper existente `github-api-request.mjs` con: `fetch`, `sleep`, reloj/tiempo inyectables, `maxAttempts=3`, `timeoutMs=10000`, `backoffMs=[250,1000]`, `maxDelayMs=5000`.
- Retraso por intento: `Retry-After` si presente y válido (segundos o fecha HTTP), si no `X-RateLimit-Reset` si válido, si no `backoffMs[attempt]`, capado a `maxDelayMs`.
- Reintentos solo para: errores de red, `AbortError`/timeout, `408`, `429`, `500`, `502`, `503`, `504`, `403` con `x-ratelimit-remaining: 0`.
- No reintentar: `401`, `404` no reconciliable (ver §3), `422` y otros `4xx` definitivos, `403` sin rate limit agotado.
- Tras agotar intentos, el fallo conserva el fail-closed actual:
  - Colección: no genera índice parcial, elimina cualquier `history.json` stale preexistente, no escribe `history.json`.
  - Si el fallo produjo entradas de cuarentena (`invalid-name`, `invalid-json`, `invalid-snapshot`, `asset-id-mismatch`, `download-failed`), se escribe `history-quarantine.json` y el proceso termina con código ≠0; si el fallo es de metadatos/paginación sin entradas, aborta con error explícito sin manifest.
  - Los assets corruptos permanecen intactos; no se usa `DELETE`; no se reescriben snapshots históricos.

## 2. Operaciones POST no idempotentes — reconciliación acotada

No se permite envolver `POST /repos/{owner}/{repo}/releases` (creación) ni `POST {upload_url}?name=` (subida) con el retry genérico ciego.

### A. Creación de release
Estado inicial: se ha ejecutado `GET /releases/tags/{tag}` y no existe (404) de forma concluyente.
1. Ejecutar `POST /releases` con `tag_name`, `target_commitish`, `name`, `body`, `draft:false`, `prerelease:false` mediante **una sola tentativa con timeout** (`singleAttemptFetch`).
2. Si responde `2xx`, usar el release devuelto y continuar.
3. Si hay red, timeout o error transitorio (`408,429,500,502,503,504,403+rate-limit`):
   a. Reconsultar `GET /releases/tags/{tag}` con resiliencia GET (3 intentos).
   b. Si existe (`200`), considerar la creación completada y usar ese release.
   c. Si no existe (`404`) y la consulta fue concluyente (respuesta `404` no transitoria), permitir **como máximo un nuevo POST** (segunda tentativa única con timeout).
   d. Tras ese segundo POST: reconsultar una vez más el tag con resiliencia GET; si existe, éxito; si no existe y fue concluyente, fallar sin crear más.
   e. Si la reconsulta es incierta (agotó reintentos GET o error no concluyente), fallar sin crear más y sin manifest de asset.
4. Si el POST devuelve error definitivo (`401,404,422,otros 4xx` no rate-limit), fallar de forma trazable y sanitizada sin reintento.

Límite absoluto: **máximo 2 POST** por operación de creación, separados siempre por una reconsulta concluyente.

### B. Subida de asset
Precondición: la búsqueda global previa por nombre exacto (`quality-snapshot-<id>.json` en todos los releases históricos paginados) no encontró el asset.
1. Ejecutar `POST {upload_url}?name={assetName}` con `Content-Type: application/octet-stream` mediante **una sola tentativa con timeout**.
2. Si responde `2xx` (`201`), terminar.
3. Si hay red, timeout o error transitorio:
   a. Rebuscar el asset exacto mediante la búsqueda global resiliente.
   b. Si existe, considerarlo ya persistido (caso de éxito ambiguo donde GitHub creó el asset pese al error).
   c. Si no existe y la búsqueda fue concluyente, permitir **como máximo un nuevo POST** (segunda tentativa única).
   d. Tras ese segundo POST: rebuscar una vez más; si existe, éxito; si no existe y fue concluyente, fallar.
   e. Si la rebúsqueda es incierta, fallar.
4. Nunca sobrescribir ni borrar un asset; la existencia, aunque aparezca tras un fallo ambiguo, se considera éxito y no se vuelve a subir.

Límite absoluto: **máximo 2 POST** por subida, con rebúsqueda concluyente entre ellos. Nunca `DELETE`/`PUT`/`PATCH`.

## 3. Errores definitivos
`401` (credenciales), `404` no reconciliable (recurso realmente ausente tras consulta concluyente), `422` (entidad no procesable) y otros `4xx` definitivos (excepto los listados como transitorios) no se reintentan automáticamente. Deben producir un fallo trazable, sanitizado (sin tokens, sin `Authorization`, sin cuerpos completos, sin URLs con credenciales) y con tipo diagnosticable (`http`/`rate-limit` según corresponda). `404` en la reconsulta de un tag/asset **es un éxito de reconciliación** (ausencia concluyente), no un error definitivo a propagar como fallo de negocio, y habilita el segundo POST.

## 4. Interfaces y límites

- Reutilizar `scripts/github-api-request.mjs`. Si hace falta una operación de **una sola tentativa con timeout** (para POST), definir explícitamente `singleAttemptFetch`/`fetchWithTimeout` que aplique `timeoutMs=10000` vía `AbortController` sin reintentos, y documentar por qué no usa el retry genérico.
- Mantener las inyecciones existentes para pruebas herméticas: `deps.request`, `deps.upload`, `deps.fetchJson`, `deps.fetchAssetBody`, `deps.fetch` según módulo. Añadir `deps.sleep`, `deps.now`, `deps.config` donde el helper lo requiera, sin exponer una nueva interfaz pública del proyecto (helper interno).
- No añadir dependencias externas (`fetch` nativo + `AbortController`).
- No cambiar `schemas/*.json`, `schemaVersion`, `snapshotId`, identidad histórica (`legacy v1`/`semantic v2`), retención ni nombres de assets (`quality-snapshot-<sha256>.json`).
- Paginación de PQ-OX12 (`per_page=100`, tope 100 páginas, filtro `quality-history-YYYY-MM`) se conserva intacta; la resiliencia se aplica por página.
- `singleAttemptFetch` debe sanitizar diagnósticos igual que el helper (acotar a ≤200 chars, redactar tokens/URLs).

## 5. Pruebas previstas (RED→GREEN)

Ubicación prevista: `scripts/test-history-api-resilience.mjs` (nuevo), integrado en `pull_request.paths`/`push.paths` y `assemble` de `quality-dashboard.yml`. Todas herméticas, sin red real, con `fetch`/`sleep`/`now` inyectados y aserciones sobre resultado observable y número de intentos, no solo invocación de mock.

1. **GET transitorio seguido de éxito** — `429` con `Retry-After: 1` → `200`; 2 llamadas, `sleep` ≈1000 ms, índice generado.
2. **GET agotado con fail-closed** — `503` x3 → 3 intentos, `ok:false` con tipo `transient`, sin índice parcial, `history.json` stale eliminado si preexistía.
3. **Timeout en creación de release y reconciliación con éxito** — `POST` timeout → `GET tag` encuentra el release → éxito sin segundo POST, `created:false` semántico.
4. **Timeout en creación sin release al reconciliar** — `POST` timeout → `GET 404` concluyente → segundo `POST 201` → éxito.
5. **Timeout en subida y asset existente al reconciliar** — `POST upload` timeout → búsqueda global encuentra `quality-snapshot-<id>.json` → éxito sin segundo POST.
6. **Timeout en subida, asset ausente, un único reintento** — `POST` timeout → búsqueda `404` concluyente → segundo `POST 201` → éxito.
7. **Fallo ambiguo persistente sin más intentos** — `POST` timeout → `GET` agota reintentos (incertidumbre) → fallo sin tercer POST, sin índice parcial.
8. **Errores definitivos sin reintento** — `401` y `422` en GET/POST → 1 llamada, tipo `http`, sin `sleep`.
9. **Ausencia de DELETE** — en todos los escenarios anteriores, `0` llamadas con `method:DELETE`.
10. **Ausencia de reemplazo de assets** — asset existente (aunque aparezca tras fallo) nunca dispara `PUT`/`PATCH` ni segundo `POST` adicional.
11. **Compatibilidad con paginación** — release válido en página 2 sigue descubriéndose bajo resiliencia; límite 100 páginas y respuestas malformadas siguen con su contrato actual.
12. **Integración en workflow** — `quality-dashboard.yml` lista el nuevo test en ambos bloques de paths y `assemble` lo ejecuta; `git diff` de workflow muestra solo esa adición.

## 6. Fuera de alcance
- Cambios visuales en dashboard, histórico o DASHBOARD.md.
- Cambios en semántica `current`/`pending`/`unavailable` o validación de informes.
- Cambios en snapshots existentes, identidad histórica, `snapshotId`, `schemaVersion`.
- Nuevas políticas de retención, pruning o reescritura de releases/assets.
- Reintentos ciegos para POST.
- Despliegues, publicación de Pages o modificación de reglas de GitHub fuera del repositorio.

## 7. Criterios de aceptación

- [ ] Cada GET resiliente reintenta solo los códigos/red/timeout listados y respeta `maxAttempts=3`, `timeoutMs=10000`, `backoff 250/1000` cap `5000`, `Retry-After` y `X-RateLimit-Reset`.
- [ ] Un GET `429` con `Retry-After` válido produce 2 llamadas y `sleep` ≈ valor indicado, sin filtrar credenciales.
- [ ] Un GET agotado tras 3 transitorios produce `ok:false` con tipo `transient`/`rate-limit`/`timeout`/`network` según caso, sin índice parcial y sin `history.json` stale utilizable.
- [ ] Creación de release con `POST` timeout y `GET` posterior que encuentra el tag termina como éxito sin segundo POST.
- [ ] Creación con `POST` timeout, `GET 404` concluyente y segundo `POST` con éxito termina como éxito.
- [ ] Subida con `POST` timeout y búsqueda que encuentra el asset termina como éxito sin segundo POST.
- [ ] Subida con `POST` timeout, búsqueda `404` concluyente y segundo `POST` con éxito termina como éxito.
- [ ] Si la reconsulta tras un fallo ambiguo queda incierta, no se hace tercer POST y el pipeline falla cerrado.
- [ ] `401`/`422` en GET o POST producen 1 intento, tipo `http`, sin `sleep` de reintento.
- [ ] En ningún escenario se emite `DELETE`, `PUT` o `PATCH`, ni se sobrescribe un asset existente.
- [ ] La paginación existente (100 páginas, `per_page=100`, filtro de releases) sigue funcionando bajo resiliencia.
- [ ] El nuevo test está listado en `quality-dashboard.yml` (`pull_request.paths`, `push.paths`) y es ejecutado por `assemble`; las 12 suites originales + la nueva terminan en 0 (total 13+), `node --check`, schemas JSON y `git diff --check` limpios.
- [ ] No se han modificado schemas, `schemaVersion`, `snapshotId`, retención ni nombres de assets.

## 8. Riesgos, reversión y compatibilidad

- **Riesgo**: Un `POST` ambiguo que GitHub ejecutó pese al timeout podría dejar un release/asset huérfano si la reconsulta falla por red; mitigado por el límite de 2 POST y el fallo cerrado sin tercer intento, dejando el estado para intervención humana.
- **Riesgo**: `Retry-After` malformado o futuro lejano podría alargar el job; mitigado por cap `5000 ms` y validación de fecha.
- **Compatibilidad**: `github-api-request.mjs` mantiene su contrato para GET; la nueva operación de una sola tentativa es interna y documentada como excepción a la resiliencia por no idempotencia.
- **Reversión**: Revertir el commit restaura `fetch` directo; no hay migraciones ni cambios de schema; los assets y snapshots existentes permanecen válidos.
