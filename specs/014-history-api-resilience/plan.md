# Plan T2: PQ-OX15 — Resiliencia segura de la API del histórico

## Enfoque
- Partir de `ed87b44` con árbol limpio, sin código productivo nuevo en este commit.
- TDD por grupos: escribir pruebas herméticas que fallen (RED), implementar mínimo para GREEN, refactorizar solo tras GREEN.
- Mantener paginación PQ-OX12, identidad histórica, schemas y workflows fuera del alcance salvo la adición del nuevo test al pipeline.

## Secuencia de implementación prevista (no ejecutada en este commit)

### Fase 1 — Resiliencia para lecturas GET
- **Archivos**: `scripts/github-api-request.mjs` (añadir `singleAttemptFetch` con timeout sin reintento + documentar), `scripts/collect-quality-history.mjs` (envolver `listHistoryReleases`, `listReleaseAssets`, `GET tag`, `GET asset body` con `resilientFetch`/`withRetry`), `scripts/persist-quality-history.mjs` (envolver `GET` de releases/assets/tag con `resilientFetch`), `scripts/test-history-api-resilience.mjs` (nuevo).
- **Comportamiento**: Cada GET usa `maxAttempts=3`, `timeoutMs=10000`, backoff `250/1000` cap `5000`, `Retry-After` > `X-RateLimit-Reset` > backoff.
- **Verificación**: Pruebas 1 (429+Retry-After), 2 (GET agotado fail-closed), 8 (401/422 sin reintento), 11 (paginación).

### Fase 2 — Reconciliación acotada para creación de release (POST no idempotente)
- **Archivos**: `scripts/persist-quality-history.mjs` (`getOrCreateRelease` y `persist-quality-history.mjs` → `persistSnapshot`), `scripts/github-api-request.mjs` (`singleAttemptFetch`), `scripts/test-history-api-resilience.mjs`.
- **Pasos**: `GET /releases/tags/{tag}` previo → `POST` único con timeout → si transitorio, `GET /releases/tags/{tag}` resiliente → si `404` concluyente de ese endpoint específico (respuesta válida `404`), segundo `POST` único → reconsulta final endpoint-específica → éxito o fallo cerrado sin tercer POST. Un `404` del propio `POST` nunca habilita el segundo POST.
- **Verificación**: Pruebas 3, 4 y 7 (segundo caso de fallo ambiguo persistente + estado incierto por reconsulta no concluyente).

### Fase 3 — Reconciliación acotada para subida de asset
- **Archivos**: `scripts/persist-quality-history.mjs` (`persistSnapshot` búsqueda global + subida), `scripts/test-history-api-resilience.mjs`.
- **Pasos**: Búsqueda global resiliente previa (200 válido sin coincidencia = ausencia concluyente) → `POST upload` único → si transitorio, rebúsqueda global → si existe (match exacto en listado 200 válido) éxito, si ausencia concluyente (200 válido sin match) segundo `POST` único → rebúsqueda final. Cualquiera de `404`, JSON inválido, timeout, red, `5xx`, `401`/`403` o paginación incompleta en la rebúsqueda es **estado incierto** → fail-closed sin tercer POST y sin declarar éxito; un `404` del propio `POST` nunca prueba ausencia.
- **Verificación**: Pruebas 5, 6, 7, 9 (sin reemplazo), 10 (sin DELETE) + regresión de `404`/paginación incompleta como incierto.

### Fase 4 — Integración y workflow
- **Archivos**: `.github/workflows/quality-dashboard.yml` (`pull_request.paths`, `push.paths`, step `Validate history API resilience` en `assemble`), `specs/014-history-api-resilience/*`, `QUALITY_HISTORY.md` (nota de resiliencia si procede).
- **Verificación**: Prueba 12, `git diff --check`, `node --check`, schemas JSON.

## Archivos de producción y test que se modificarían en la implementación
- `scripts/github-api-request.mjs` — helper resiliente + operación de una sola tentativa con timeout.
- `scripts/collect-quality-history.mjs` — lecturas GET resilientes.
- `scripts/persist-quality-history.mjs` — lecturas GET resilientes + reconciliación de `POST` (release y asset).
- `scripts/test-history-api-resilience.mjs` — **nuevo** (12 pruebas RED→GREEN).
- `.github/workflows/quality-dashboard.yml` — añadir `scripts/test-history-api-resilience.mjs` a `pull_request.paths` y `push.paths`, y ejecutar `node scripts/test-history-api-resilience.mjs` en `assemble`.

## Dependencias y orden
- Fase 1 debe preceder a Fases 2 y 3 (GET resiliente es base para reconsultas).
- Fases 2 y 3 pueden desarrollarse en paralelo tras Fase 1, pero comparten el helper `singleAttemptFetch`.
- Fase 4 tras 1-3.

## Verificación
- `node scripts/test-history-api-resilience.mjs` (RED antes, GREEN después) + `for file in scripts/test-*.mjs; do node "$file"; done` (13+ suites).
- `node --check scripts/*.mjs`, `node -e "JSON.parse(...schemas/*.json)"`, `git diff --check`.
- Revisión de `git diff --stat` y `git diff` completo vs `ed87b44`.

## Riesgos y mitigaciones (plan)
- Reintentos ciegos en POST → mitigado por reconciliación con límite de 2 POST y rebúsqueda concluyente.
- Diagnósticos con credenciales → sanitizar mensajes y no incluir `Authorization`, cuerpos ni URLs con token.
- `Retry-After` inválido → fallback a backoff capado.
