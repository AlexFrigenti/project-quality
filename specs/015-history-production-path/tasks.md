# Tareas T2: PQ-OX16 — Cierre hermético de la ruta de producción

## Fase 0 — Spec-only (este commit)
- [x] Verificar `ce2e43d` y árbol limpio, crear rama `feat/pq-ox16-history-production-path`
- [x] Leer `github-api-request.mjs`, `collect-quality-history.mjs`, `persist-quality-history.mjs`, `history-pagination.mjs`, `test-history-api-resilience.mjs`, spec/plan/tasks de `014` y workflow
- [x] Documentar hallazgo (rutas directas + seams de test vs producción + doble retry potencial)
- [x] Crear `specs/015-history-production-path/spec.md` con problema, evidencia, arquitectura, límites, semántica, matriz de 14 pruebas y criterios
- [x] Crear `specs/015-history-production-path/plan.md` con 4 fases + verificación
- [x] Crear `specs/015-history-production-path/tasks.md` (este archivo)
- [ ] Ejecutar `git diff --check` y confirmar solo 3 artefactos documentales en el diff
- [ ] Commit único `docs: define PQ-OX16 history production path` y árbol limpio

## Fase 1 — Adaptadores GET y eliminación de fetch directos (TDD)
- [ ] Prueba RED: `collectQualityHistory` con `deps.fetch` únicamente y `429` → debe reintentar (falla en base por `defaultFetchJson` directo)
- [ ] Prueba RED: `persistSnapshot` con `deps.fetch` únicamente → GET resiliente (falla en base)
- [ ] Implementar `singleAttemptFetch` en `github-api-request.mjs`
- [ ] Reemplazar `defaultFetchJson`/`defaultFetchAssetBody` por adaptadores resilientes en `collect-*`
- [ ] Reemplazar `githubRequest`/`uploadAsset` directos por `resilientFetch`/`singleAttemptFetch` en `persist-*`
- [ ] Eliminar `fetch(` fuera de `github-api-request.mjs` en los tres ficheros
- [ ] Verificación estática 12 GREEN: `grep -R "fetch(" collect|persist|history-pagination` == 0

## Fase 2 — Unificación de retry
- [ ] Prueba RED: un GET con `429` debe provocar exactamente 2 `fetch` de bajo nivel, no 4-6 por doble capa
- [ ] Auditar `resilientGetTag`/`findAssetResilient` para una sola capa `withRetry` o `resilientFetch`
- [ ] Documentar por qué POST usa `singleAttemptFetch`

## Fase 3 — Camino predeterminado (14 pruebas RED→GREEN, sin seams de alto nivel)
- [ ] 1. `collectQualityHistory` con `deps.fetch` únicamente
- [ ] 2. `persistSnapshot` con `deps.fetch` únicamente
- [ ] 3. GET releases timeout → reintento → éxito
- [ ] 4. GET 429 con `Retry-After` → delay respetado
- [ ] 5. GET 403 + `X-RateLimit-Reset` → delay respetado
- [ ] 6. GET 404 válido con JSON → ausencia concluyente (habilita 2º POST)
- [ ] 7. GET 404 con cuerpo inválido → no concluyente
- [ ] 8. Descarga asset timeout → reintento → éxito
- [ ] 9. POST release una única tentativa
- [ ] 10. POST asset una única tentativa
- [ ] 11. No doble retry en GET
- [ ] 12. `singleAttemptFetch` no reintenta (503 x3 → 1 llamada)
- [ ] 13. Límite dos POST + reconciliación intacta
- [ ] 14. Estático sin fetch directo

## Fase 4 — Workflow e integración
- [ ] Añadir `scripts/test-history-production-path.mjs` a `pull_request.paths` y `push.paths`
- [ ] Ejecutar `node scripts/test-history-production-path.mjs` desde `assemble`
- [ ] `for file in scripts/test-*.mjs; do node "$file"; done` (15+ suites) GREEN
- [ ] `node --check scripts/*.mjs`, schemas JSON, `git diff --check`, `git diff --stat` limitado
