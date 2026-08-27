# Tareas: PQ-OX23 — Paridad contractual del esquema de cuarentena histórica

## Fase 1 — Verificación RED

- [ ] **Tarea 1.1 (RED - Detección de paridad ausente)**: Añadir en `scripts/test-schema-validator-parity.mjs` una aserción temporal que exija la evaluación completa de `quarantine` y falle antes de la actualización completa del archivo.
- [ ] **Tarea 1.2 (Verificación RED)**: Ejecutar `node scripts/test-schema-validator-parity.mjs` y documentar el fallo en rojo (RED).

---

## Fase 2 — Implementación GREEN

- [ ] **Tarea 2.1 (GREEN - Importaciones y cierre de objetos raíz)**: Importar `QUARANTINE_REASONS` y `QUARANTINE_DETAIL_LIMIT`, e incorporar `quarantine` al bucle de validación de objetos raíz cerrados (`additionalProperties: false`).
- [ ] **Tarea 2.2 (GREEN - Paridad de $defs.entry y propiedades)**: Añadir aserciones para `$defs.entry.additionalProperties`, paridad de `reason.enum` contra `QUARANTINE_REASONS`, límite de `detail.maxLength` contra `QUARANTINE_DETAIL_LIMIT` y patrones de `releaseTag` y `generatedAt`.
- [ ] **Tarea 2.3 (Verificación GREEN)**: Ejecutar `node scripts/test-schema-validator-parity.mjs` y verificar que la suite pasa en verde.

---

## Fase 3 — Regresión y verificación integral

- [ ] **Tarea 3.1 (Suites completas)**: Ejecutar las 19 suites de prueba (`scripts/test-*.mjs`) y confirmar código de salida 0.
- [ ] **Tarea 3.2 (Sintaxis)**: Ejecutar `node --check scripts/*.mjs` y verificar 0 errores de sintaxis.
- [ ] **Tarea 3.3 (Schemas)**: Validar parseo de todos los esquemas en `schemas/*.json`.
- [ ] **Tarea 3.4 (Revisión de diff)**: Ejecutar `git diff --check` y verificar que el diff contra `origin/main` contiene exactamente los archivos del sprint.
