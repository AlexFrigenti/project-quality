# Plan de implementación: PQ-OX22 — Paridad y completitud contractual de node-quality.yml

## Resumen del enfoque

Este plan establece una implementación estrictamente TDD (RED → GREEN) para ampliar la cobertura de [`scripts/test-node-quality-workflow.mjs`](file:///c:/Users/AlexF/Documents/GitHub/project-quality/scripts/test-node-quality-workflow.mjs) hasta el 100% de la superficie declarativa de [`.github/workflows/node-quality.yml`](file:///c:/Users/AlexF/Documents/GitHub/project-quality/.github/workflows/node-quality.yml), modularizar su lógica mediante `validateNodeQualityWorkflowContent(content)` y verificar su robustez en memoria y en subproceso ante saltos de línea CRLF.

---

## Fases de ejecución

### Fase 1 — RED (Definición incremental de aserciones contractuales no cubiertas)
1. **Comprobar precondiciones:**
   - Rama: `feat/pq-ox22-node-quality-workflow-contract`.
   - Base `origin/main` en `344fec8dbc19b8d35da159be1d4f583b3c099121`.
   - Árbol de trabajo 100% limpio.
2. **Añadir aserciones RED en `scripts/test-node-quality-workflow.mjs`:**
   - Exigir la exportación de `validateNodeQualityWorkflowContent`.
   - Añadir aserciones que fallen temporalmente si se introducen discrepancias simuladas (por ejemplo, validando los 5 inputs obligatorios, los 11 inputs opcionales, los 11 gates y las 4 dependencias de sparse-checkout).
3. **Ejecutar prueba RED:**
   - Registrar la ejecución y el fallo esperado ante una condición de validación ausente.

### Fase 2 — GREEN (Completitud contractual y modularización)
1. **Refactorizar y completar [`scripts/test-node-quality-workflow.mjs`](file:///c:/Users/AlexF/Documents/GitHub/project-quality/scripts/test-node-quality-workflow.mjs):**
   - Exportar `validateNodeQualityWorkflowContent(content)`.
   - Validar los 5 inputs obligatorios: `standard-version`, `standard-sha`, `install-command`, `build-command`, `test-command`.
   - Validar los 11 inputs opcionales y defaults: `node-version`, `preflight-command`, `lint-command`, `typecheck-command`, `test-results-file`, `coverage-command`, `e2e-install-command`, `e2e-command`, `smoke-command`, `metrics-command`, `metrics-file`.
   - Validar los steps de ejecución y orden de diagnósticos de tests.
   - Validar los steps de gates y comandos: `install`, `preflight`, `lint`, `typecheck`, `build`, `tests`, `coverage`, `e2e_install`, `e2e`, `smoke`, `metrics`.
   - Validar las 4 dependencias requeridas en el `sparse-checkout:`.
   - Validar `QUALITY_PROJECT_KIND: node`, `QUALITY_GATE_IDS` (11 gates), aplicabilidades y outcomes.
   - Validar `Validate quality metrics` y subida obligatoria de `quality-metrics` (`if-no-files-found: error`).
   - Incluir prueba sintética directa de tolerancia CRLF con `assert.doesNotThrow`.
2. **Verificar [`scripts/test-node-quality-workflow-crlf.mjs`](file:///c:/Users/AlexF/Documents/GitHub/project-quality/scripts/test-node-quality-workflow-crlf.mjs):**
   - Confirmar que la suite de subproceso CRLF pasa limpiamente sin errores.
3. **Ejecutar pruebas GREEN:**
   - `node scripts/test-node-quality-workflow.mjs` → `Node quality workflow diagnostics contract válido.`
   - `node scripts/test-node-quality-workflow-crlf.mjs` → `Node quality workflow contract CRLF válido.`

### Fase 3 — Regresión y verificación integral
1. **Ejecución de las 19 suites completas:**
   - Ejecutar todos los `scripts/test-*.mjs` y confirmar que las 19 suites pasan con código de salida 0.
2. **Verificación de sintaxis:**
   - `node --check scripts/*.mjs`.
3. **Verificación de esquemas:**
   - Parsear todos los esquemas en `schemas/*.json`.
4. **Verificación de diff:**
   - `git diff --check`.
   - `git diff --name-only origin/main...HEAD` asegurando que contiene exactamente los archivos documentados y autorizados.

---

## Criterios de parada y mitigación

- Si `test-node-quality-workflow.mjs` detecta alguna discrepancia en `node-quality.yml`, verificar antes de modificar YAML si la discrepancia es un defecto del test o un error real del workflow.
- No alterar la gobernanza universal independiente de `main-quality-gate.yml` ni el inventario de suites en `quality-dashboard.yml`.
