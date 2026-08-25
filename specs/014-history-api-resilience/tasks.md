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
- [ ] Implementar en `scripts/persist-quality-history.mjs`: `GET tag` previo → POST único con timeout → si transitorio, GET tag resiliente → si 404 concluyente segundo POST único → reconsulta final → éxito o fallo cerrado (máx 2 POST)
- [ ] Prueba 3 RED→GREEN: POST timeout + GET encuentra tag → éxito sin segundo POST
- [ ] Prueba 4 RED→GREEN: POST timeout + GET 404 concluyente + segundo POST 201 → éxito
- [ ] Prueba 7a RED→GREEN: fallo ambiguo persistente (GET agota reintentos) → sin tercer POST, fail-closed

## Fase 3 — Reconciliación de subida de asset (POST no idempotente)
- [ ] Implementar en `scripts/persist-quality-history.mjs`: búsqueda global resiliente previa → POST único → si transitorio, rebúsqueda → si existe éxito, si 404 concluyente segundo POST → rebúsqueda final
- [ ] Prueba 5 RED→GREEN: POST upload timeout + rebúsqueda encuentra asset → éxito sin segundo POST
- [ ] Prueba 6 RED→GREEN: POST timeout + rebúsqueda 404 + segundo POST 201 → éxito
- [ ] Prueba 7b RED→GREEN: rebúsqueda incierta tras fallo → sin tercer POST, fail-closed
- [ ] Prueba 9 RED→GREEN: 0 DELETE en todos los escenarios
- [ ] Prueba 10 RED→GREEN: asset existente nunca dispara PUT/PATCH ni POST adicional

## Fase 4 — Workflow, integración y verificación
- [ ] Añadir `scripts/test-history-api-resilience.mjs` con las 12 pruebas herméticas (sleep/now/config inyectados, fixtures completos)
- [ ] Modificar `.github/workflows/quality-dashboard.yml`: añadir `scripts/test-history-api-resilience.mjs` a `pull_request.paths` y `push.paths`, añadir step `Validate history API resilience` en `assemble`
- [ ] Verificación: `node scripts/test-history-api-resilience.mjs` RED antes / GREEN después + `for file in scripts/test-*.mjs; do node "$file"; done` (13+ suites)
- [ ] Verificación: `node --check scripts/*.mjs`, `node -e "JSON.parse(...schemas/*.json)"`, `git diff --check`, `git diff --stat` vs base
- [ ] Documentar riesgos (release/asset huérfano ambiguo, Retry-After cap), reversión y compatibilidad histórica sin cambios de schema/snapshotId
