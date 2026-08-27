# Tareas: PQ-OX21 — Contrato y validación del workflow static-quality.yml

## Fase 1 — Comprobaciones previas y verificación RED

- [ ] **Tarea 1.1 (RED - Preparación de paths y triggers)**: Actualizar la expectativa de suites del dashboard a 18 en `scripts/test-dashboard-trigger-paths.mjs`.
- [ ] **Tarea 1.2 (Verificación RED)**: Ejecutar `node scripts/test-dashboard-trigger-paths.mjs` y documentar el fallo en rojo (RED) por ausencia de `test-static-quality-workflow.mjs` y omisión en `assemble`.

---

## Fase 2 — Implementación GREEN

- [ ] **Tarea 2.1 (GREEN - Creación de la suite contractual)**: Crear `scripts/test-static-quality-workflow.mjs` con aserciones para inputs, step de validación, steps opcionales, sparse-checkout, gates, variables de entorno, generación/validación de métricas y prueba sintética de tolerancia a CRLF.
- [ ] **Tarea 2.2 (GREEN - Integración en quality-dashboard.yml)**: Añadir `node scripts/test-static-quality-workflow.mjs` al step de ejecución de suites del job `assemble` y registrar la ruta en `pull_request.paths` y `push.paths`.
- [ ] **Tarea 2.3 (GREEN - Ajuste de test-dashboard-trigger-paths.mjs)**: Confirmar que `test-dashboard-trigger-paths.mjs` valida 18 suites de dashboard con simetría de paths.
- [ ] **Tarea 2.4 (Verificación GREEN)**: Ejecutar `node scripts/test-static-quality-workflow.mjs` y `node scripts/test-dashboard-trigger-paths.mjs`, verificando que ambas suites pasan en verde.

---

## Fase 3 — Regresión y verificación integral

- [ ] **Tarea 3.1 (Suites completas)**: Ejecutar las 19 suites de prueba (`scripts/test-*.mjs`) y confirmar código de salida 0.
- [ ] **Tarea 3.2 (Sintaxis)**: Ejecutar `node --check scripts/*.mjs` y verificar 0 errores de sintaxis.
- [ ] **Tarea 3.3 (Schemas)**: Validar parseo de todos los esquemas en `schemas/*.json`.
- [ ] **Tarea 3.4 (Revisión de diff)**: Ejecutar `git diff --check` y verificar que el diff contra `origin/main` contiene exactamente los archivos del sprint.
