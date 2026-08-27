# Tareas: PQ-OX20 — Higiene y consistencia de collect-quality-evidence

## Fase 1 — Guardas estáticas y verificación RED

- [ ] **Tarea 1.1 (RED - Guarda función huérfana)**: Añadir aserción en `scripts/test-quality-evidence.mjs` que rechace la presencia de declaraciones `request` en `scripts/collect-quality-evidence.mjs`.
- [ ] **Tarea 1.2 (RED - Guarda resolución `globalThis.fetch`)**: Añadir aserción en `scripts/test-quality-evidence.mjs` que verifique la presencia de `deps.fetch || globalThis.fetch` en `readArtifactJson`.
- [ ] **Tarea 1.3 (Verificación RED)**: Ejecutar `node scripts/test-quality-evidence.mjs` y documentar el fallo esperado en rojo.

---

## Fase 2 — Implementación GREEN

- [ ] **Tarea 2.1 (GREEN - Eliminación de código muerto)**: Eliminar la función huérfana de nivel de módulo `async function request(path)` en `scripts/collect-quality-evidence.mjs`.
- [ ] **Tarea 2.2 (GREEN - Normalización de cliente global)**: Sustituir `deps.fetch || fetch` por `deps.fetch || globalThis.fetch` en `readArtifactJson` dentro de `scripts/collect-quality-evidence.mjs`.
- [ ] **Tarea 2.3 (Verificación GREEN)**: Ejecutar `node scripts/test-quality-evidence.mjs` y confirmar que pasa en verde satisfactoriamente.

---

## Fase 3 — Regresión y verificación integral

- [ ] **Tarea 3.1 (Suites completas)**: Ejecutar las 18 suites de tests de `scripts/test-*.mjs` y confirmar código de salida 0.
- [ ] **Tarea 3.2 (Sintaxis)**: Ejecutar `node --check scripts/*.mjs` y validar ausencia de errores de sintaxis.
- [ ] **Tarea 3.3 (Schemas)**: Validar parseo de todos los esquemas en `schemas/*.json`.
- [ ] **Tarea 3.4 (Revisión de diff)**: Ejecutar `git diff --check` y verificar que el diff frente a `origin/main` contiene exclusivamente los archivos del sprint.
