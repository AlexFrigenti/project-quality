# Tareas T2: PQ-OX15 — Resiliencia segura de la API del histórico

## Fase 0 — Preparación (spec-only, este commit)
- [x] Confirmar base `ed87b44fa9fc6ecaf547ed8911b153cff5234a92`, árbol limpio y rama `feat/pq-ox15-history-api-resilience`
- [x] Crear `specs/014-history-api-resilience/spec.md` (objetivo, alcance GET/POST, errores definitivos, interfaces/límites)
- [x] Crear `specs/014-history-api-resilience/plan.md` (fases, archivos afectados, orden, verificación)
- [x] Crear `specs/014-history-api-resilience/tasks.md` (este archivo) cubriendo todos los criterios de aceptación
- [ ] Ejecutar `git diff --check` y confirmar solo artefactos de spec en el diff

## Fase 1 — Lecturas GET resilientes
- [ ] Extender `scripts/github-api-request.mjs` con `singleAttemptFetch` (timeout 10s sin reintento) documentado como excepción por no idempotencia
- [ ] Envolver `scripts/collect-quality-history.mjs`: `listHistoryReleases`, `listReleaseAssets`, `GET tag`, `GET asset body` con `resilientFetch`/`withRetry` (maxAttempts 3, timeout 10s, backoff 250/1000 cap 5000, Retry-After/X-RateLimit-Reset)
- [ ] Envolver `scripts/persist-quality-history.mjs`: `GET releases`, `GET assets`, `GET tag` con resiliencia GET
- [ ] Prueba 1 RED→GREEN: GET 429 con Retry-After → 200 (2 llamadas, sleep ≈ valor, sin credenciales filtradas)
- [ ] Prueba 2 RED→GREEN: GET 503 x3 → fail-closed (ok:false, tipo transient, sin índice parcial, stale eliminado)
- [ ] Prueba 8 RED→GREEN: 401 y 422 → 1 intento, tipo http, sin sleep
- [ ] Prueba 11 RED→GREEN: paginación (release en página 2 descubierto, límite 100 páginas, respuestas malformadas)

## Fase 2 — Reconciliación de creación de release (POST no idempotente)
- [ ] Implementar en `scripts/persist-quality-history.mjs`: `GET /releases/tags/{tag}` previo (404 concluyente = respuesta válida 404) → POST único con timeout → si transitorio, `GET /releases/tags/{tag}` resiliente → si 200 existe → éxito sin segundo POST; si **404 concluyente endpoint-específico** (`GET` 404 válido) → segundo POST único → reconsulta final endpoint-específica → éxito o fallo cerrado (máx 2 POST, 404 del propio POST nunca habilita)
- [ ] Prueba 3 RED→GREEN: POST timeout + GET tag 200 → éxito sin segundo POST
- [ ] Prueba 4 RED→GREEN: POST timeout + GET tag 404 concluyente + segundo POST 201 → éxito
- [ ] Prueba 7a RED→GREEN: fallo ambiguo persistente (GET tag agota reintentos / 5xx / 401 / paginación incompleta) → sin tercer POST, fail-closed, sin manifest de asset

## Fase 3 — Reconciliación de subida de asset (POST no idempotente)
- [ ] Implementar en `scripts/persist-quality-history.mjs`: búsqueda global resiliente previa (200 válido sin coincidencia = ausencia concluyente) → POST único → si transitorio, rebúsqueda global → si existe (200 válido con match) → éxito; si ausencia concluyente (200 válido sin match) → segundo POST → rebúsqueda final; si rebúsqueda incierta (404, JSON inválido, timeout, red, 5xx, 401/403, paginación incompleta) → fail-closed sin tercer POST y sin declarar éxito; 404 del propio POST nunca prueba ausencia
- [ ] Prueba 5 RED→GREEN: POST upload timeout + rebúsqueda encuentra asset (200 válido) → éxito sin segundo POST
- [ ] Prueba 6 RED→GREEN: POST timeout + rebúsqueda ausencia concluyente (200 válido sin match) + segundo POST 201 → éxito
- [ ] Prueba 7b RED→GREEN: rebúsqueda incierta (404 / timeout / 5xx / paginación incompleta) tras fallo → sin tercer POST, fail-closed
- [ ] Prueba 9 RED→GREEN: 0 DELETE en todos los escenarios
- [ ] Prueba 10 RED→GREEN: asset existente (incluso tras fallo ambiguo) nunca dispara PUT/PATCH ni POST adicional

## Fase 4 — Workflow, integración y verificación
- [ ] Añadir `scripts/test-history-api-resilience.mjs` con las 12 pruebas herméticas (sleep/now/config inyectados, fixtures completos)
- [ ] Modificar `.github/workflows/quality-dashboard.yml`: añadir `scripts/test-history-api-resilience.mjs` a `pull_request.paths` y `push.paths`, añadir step `Validate history API resilience` en `assemble`
- [ ] Verificación: `node scripts/test-history-api-resilience.mjs` RED antes / GREEN después + `for file in scripts/test-*.mjs; do node "$file"; done` (13+ suites)
- [ ] Verificación: `node --check scripts/*.mjs`, `node -e "JSON.parse(...schemas/*.json)"`, `git diff --check`, `git diff --stat` vs base
- [ ] Documentar riesgos (release/asset huérfano ambiguo, Retry-After cap), reversión y compatibilidad histórica sin cambios de schema/snapshotId
