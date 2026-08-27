# Tareas: PQ-OX22 — Paridad y completitud contractual de node-quality.yml

## Fase 1 — Verificación RED

- [ ] **Tarea 1.1 (RED - Exportación y aserciones de inputs faltantes)**: Añadir en `scripts/test-node-quality-workflow.mjs` aserciones que fallen ante la omisión de la función exportada `validateNodeQualityWorkflowContent` y validación estricta de los 5 inputs obligatorios y 11 opcionales.
- [ ] **Tarea 1.2 (Verificación RED)**: Ejecutar `node scripts/test-node-quality-workflow.mjs` y documentar el fallo en rojo (RED).

---

## Fase 2 — Implementación GREEN

- [ ] **Tarea 2.1 (GREEN - Exportación de validador y cobertura de inputs)**: Modularizar `scripts/test-node-quality-workflow.mjs` con `export function validateNodeQualityWorkflowContent(content)` y aserciones completas de los 16 inputs con sus tipos y valores por defecto.
- [ ] **Tarea 2.2 (GREEN - Cobertura de steps, gates y sparse-checkout)**: Añadir aserciones para los 11 gates (`install`, `preflight`, `lint`, `typecheck`, `build`, `tests`, `coverage`, `e2e_install`, `e2e`, `smoke`, `metrics`), el step de diagnósticos, las 4 dependencias en `sparse-checkout:` y la inyección de variables de entorno.
- [ ] **Tarea 2.3 (GREEN - Validación de métricas, artefacto y CRLF)**: Añadir aserciones para `Validate quality metrics`, `Upload quality metrics` con `if-no-files-found: error` y prueba sintética en memoria ante saltos CRLF (`assert.doesNotThrow`).
- [ ] **Tarea 2.4 (Verificación GREEN)**: Ejecutar `node scripts/test-node-quality-workflow.mjs` y `node scripts/test-node-quality-workflow-crlf.mjs`, verificando que ambas suites pasan en verde.

---

## Fase 3 — Regresión y verificación integral

- [ ] **Tarea 3.1 (Suites completas)**: Ejecutar las 19 suites de prueba (`scripts/test-*.mjs`) y confirmar código de salida 0.
- [ ] **Tarea 3.2 (Sintaxis)**: Ejecutar `node --check scripts/*.mjs` y verificar 0 errores de sintaxis.
- [ ] **Tarea 3.3 (Schemas)**: Validar parseo de todos los esquemas en `schemas/*.json`.
- [ ] **Tarea 3.4 (Revisión de diff)**: Ejecutar `git diff --check` y verificar que el diff contra `origin/main` contiene exactamente los archivos del sprint.
