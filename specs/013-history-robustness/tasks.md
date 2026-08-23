# Tareas: PQ-OX07 Robustez del histórico persistente

- [x] Rama `feat/pq-ox07-history-robustness` desde `origin/main` `39228aba1f65bc8be6d6d2038c07ad0e0fc9e95b`.
- [x] Spec, plan y tareas (T2) con alcance aprobado A–F.
- [ ] Grupo A: schema de cuarentena + módulo + suite propia (RED→GREEN).
- [ ] Grupo B: paginación completa e inyección de red en la colección (RED→GREEN).
- [ ] Grupo A+B integración: cuarentena fail-closed de la colección y manifest como artifact.
- [ ] Grupo C: deduplicación determinista del índice (RED→GREEN).
- [ ] Grupo D: deduplicación global entre releases en persistencia (RED→GREEN).
- [ ] Grupo F: workflow (paths, paso de validación, upload condicional) sin relajar guards.
- [ ] `QUALITY_HISTORY.md`: cuarentena, fallo cerrado, paginación, deduplicaciones y retención indefinida sin pruning.
- [ ] Verificación final: suites `scripts/test-*.mjs` en 0, `node --check`, schemas parseables, `git diff --check`.
