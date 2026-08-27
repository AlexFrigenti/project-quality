# Plan de implementación: PQ-OX21 — Contrato y validación del workflow static-quality.yml

## Resumen del enfoque

Este plan establece una implementación estrictamente TDD (RED → GREEN) para dotar a `.github/workflows/static-quality.yml` de una suite contractual exhaustiva ([scripts/test-static-quality-workflow.mjs](file:///c:/Users/AlexFrigenti/Documents/GitHub/project-quality/scripts/test-static-quality-workflow.mjs)), integrarla en el job `assemble` de [.github/workflows/quality-dashboard.yml](file:///c:/Users/AlexFrigenti/Documents/GitHub/project-quality/.github/workflows/quality-dashboard.yml) y actualizar [scripts/test-dashboard-trigger-paths.mjs](file:///c:/Users/AlexFrigenti/Documents/GitHub/project-quality/scripts/test-dashboard-trigger-paths.mjs) para mantener la simetría y cierre contractual del pipeline.

---

## Fases de ejecución

### Fase 1 — RED (Detección de ausencia e inconsistencia de trigger paths)
1. **Comprobar precondiciones:**
   - Rama: `feat/pq-ox21-static-quality-workflow-contract`.
   - Base `origin/main` en `07f8f8d552627fca22163ebe609139d78b54d169`.
   - Árbol de trabajo 100% limpio.
2. **Actualizar temporalmente `scripts/test-dashboard-trigger-paths.mjs`:**
   - Actualizar el conteo esperado del dominio del dashboard a 18 suites (o añadir la aserción de presencia de `test-static-quality-workflow.mjs`).
3. **Ejecutar prueba RED:**
   - Ejecutar `node scripts/test-dashboard-trigger-paths.mjs`.
   - Registrar el fallo en rojo (RED) confirmando que `test-static-quality-workflow.mjs` no existe en `scripts/` y no está en `assemble`.

### Fase 2 — GREEN (Creación de suite e integración)
1. **Crear [scripts/test-static-quality-workflow.mjs](file:///c:/Users/AlexFrigenti/Documents/GitHub/project-quality/scripts/test-static-quality-workflow.mjs):**
   - Validar inputs obligatorios y opcionales de `static-quality.yml`.
   - Validar step `Deterministic static validation` con `id: validation` y `${{ inputs.validation-command }}`.
   - Validar steps condicionales `smoke` y `metrics`.
   - Validar las 4 dependencias requeridas en el `sparse-checkout:`.
   - Validar `QUALITY_GATE_IDS: validation smoke metrics` y el mapeo de aplicabilidad / outcomes.
   - Validar los steps de `Validate quality metrics` y `Upload quality metrics` con `if-no-files-found: error`.
   - Validar tolerancia explícita ante finales de línea CRLF mediante prueba sintética.
2. **Integrar en [.github/workflows/quality-dashboard.yml](file:///c:/Users/AlexFrigenti/Documents/GitHub/project-quality/.github/workflows/quality-dashboard.yml):**
   - Añadir `node scripts/test-static-quality-workflow.mjs` a los steps de ejecución de tests del job `assemble`.
   - Añadir `"scripts/test-static-quality-workflow.mjs"` a `pull_request.paths` y `push.paths`.
3. **Actualizar [scripts/test-dashboard-trigger-paths.mjs](file:///c:/Users/AlexFrigenti/Documents/GitHub/project-quality/scripts/test-dashboard-trigger-paths.mjs):**
   - Establecer `assert.equal(dashboardDomainSuites.length, 18, ...);`.
4. **Ejecutar prueba GREEN:**
   - `node scripts/test-static-quality-workflow.mjs` → `Static quality workflow contract válido.`
   - `node scripts/test-dashboard-trigger-paths.mjs` → `Dashboard trigger paths contract válido.`

### Fase 3 — Regresión y verificación integral
1. **Ejecución de las 19 suites completas:**
   - Ejecutar todos los `scripts/test-*.mjs` y confirmar que las 19 suites pasan con código de salida 0.
2. **Verificación de sintaxis:**
   - `node --check scripts/*.mjs`.
3. **Verificación de esquemas:**
   - Parsear todos los esquemas en `schemas/*.json`.
4. **Verificación de diff:**
   - `git diff --check`.
   - `git diff --name-only origin/main...HEAD` asegurando que contiene exactamente los 6 archivos previstos:
     - `scripts/test-static-quality-workflow.mjs`
     - `.github/workflows/quality-dashboard.yml`
     - `scripts/test-dashboard-trigger-paths.mjs`
     - `specs/020-static-quality-workflow-contract/spec.md`
     - `specs/020-static-quality-workflow-contract/plan.md`
     - `specs/020-static-quality-workflow-contract/tasks.md`

---

## Criterios de parada y mitigación

- Si `test-static-quality-workflow.mjs` detecta alguna inconsistencia en `static-quality.yml`, verificar antes de modificar YAML si la discrepancia es un defecto del test o un error real del workflow.
- No alterar la gobernanza universal independiente de `main-quality-gate.yml`.
