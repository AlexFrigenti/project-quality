# Tareas: PQ-OX18 — Cierre y consistencia contractual de quality-dashboard.yml y trigger paths

## Fase 1: Base y especificación documental (Fase Actual)

- [x] Confirmar base `bd1723e80e19e3bf144e7171f89520de740e05c8` y árbol limpio
- [x] Crear rama local `feat/pq-ox18-dashboard-contract-closure`
- [x] Redactar `specs/017-dashboard-contract-closure/spec.md` con evidencia, matriz de dependencias e invariantes
- [x] Redactar `specs/017-dashboard-contract-closure/plan.md` con secuencia TDD detallada
- [x] Redactar `specs/017-dashboard-contract-closure/tasks.md` (este archivo)
- [ ] Commit documental único con solo los tres archivos de especificación

---

## Fase 2: TDD — Pruebas RED del contrato (Futura Implementación)

- [ ] Añadir aserción RED en `scripts/test-dashboard-trigger-paths.mjs` para verificar la ejecución de suites ausentes en el job `assemble` (`test-actions-runtime.mjs`, `test-history-quarantine.mjs`, `test-github-api-resilience.mjs`)
- [ ] Añadir aserción RED en `scripts/test-dashboard-trigger-paths.mjs` para verificar la presencia de `scripts/fixture-history-legacy.mjs` en `pull_request.paths` y `push.paths`
- [ ] Añadir aserción RED en `scripts/test-dashboard-trigger-paths.mjs` para verificar la presencia de `scripts/test-github-api-resilience.mjs` en `pull_request.paths` y `push.paths`
- [ ] Ejecutar `node scripts/test-dashboard-trigger-paths.mjs` contra la base actual y constatar el fallo esperado (RED)

---

## Fase 3: TDD — Implementación mínima y estado GREEN (Futura Implementación)

- [ ] Añadir `"scripts/fixture-history-legacy.mjs"` a `pull_request.paths` y `push.paths` en `.github/workflows/quality-dashboard.yml`
- [ ] Añadir `"scripts/test-github-api-resilience.mjs"` a `pull_request.paths` y `push.paths` en `.github/workflows/quality-dashboard.yml`
- [ ] Añadir paso de ejecución de `node scripts/test-actions-runtime.mjs` en el job `assemble` de `.github/workflows/quality-dashboard.yml`
- [ ] Añadir paso de ejecución de `node scripts/test-history-quarantine.mjs` en el job `assemble` de `.github/workflows/quality-dashboard.yml`
- [ ] Añadir paso de ejecución de `node scripts/test-github-api-resilience.mjs` en el job `assemble` de `.github/workflows/quality-dashboard.yml`
- [ ] Ejecutar `node scripts/test-dashboard-trigger-paths.mjs` y verificar que la suite pasa limpiamente (GREEN)

---

## Fase 4: Verificación de invariantes y regresiones (Futura Implementación)

- [ ] Verificar que `.github/workflows/main-quality-gate.yml` y `scripts/test-main-quality-gate.mjs` no han sufrido alteraciones
- [ ] Ejecutar `node scripts/test-main-quality-gate.mjs` y confirmar código de salida 0
- [ ] Ejecutar las 18 suites de prueba existentes en `scripts/test-*.mjs` y confirmar código de salida 0 en todas
- [ ] Ejecutar comprobación sintáctica `node --check scripts/*.mjs`
- [ ] Ejecutar validación de esquemas JSON en `schemas/*.json`
- [ ] Ejecutar `git diff --check` para garantizar ausencia de errores de formato o espacios en blanco

---

## Fase 5: Revisión de diff y entrega (Futura Implementación)

- [ ] Ejecutar revisión independiente del diff completo frente a `origin/main`
- [ ] Confirmar que únicamente se modificaron `.github/workflows/quality-dashboard.yml` y `scripts/test-dashboard-trigger-paths.mjs`
- [ ] Elaborar informe final de entrega según las pautas de `AGENTS.md`
