# Tareas: Explicación de por qué no aplica en las áreas excluidas por perfil

- [x] Crear artefactos T2 (`spec.md`, `plan.md`, `tasks.md`).
- [x] Ampliar `schemas/quality-history.schema.json` con la forma `{area, reason}`.
- [x] Ampliar `scripts/validate-quality-history.mjs` para ambas formas y casos inválidos.
- [x] Añadir pruebas de contrato en `scripts/test-quality-history.mjs`.
- [x] Normalizar entradas en `scripts/persist-quality-history.mjs` conservando la forma legacy.
- [x] Declarar razones en los cuatro perfiles de `scripts/audit-repository.mjs`.
- [x] Actualizar `scripts/test-audit-profiles.mjs` (contrato nuevo + compatibilidad legacy).
- [x] Renderizar explicaciones en `dashboard/history.html` y ampliar `scripts/test-history-rendering.mjs`.
- [x] Renderizar explicaciones en `dashboard/index.html` y cubrirlo desde `scripts/test-dashboard.mjs`.
- [x] Actualizar `QUALITY_HISTORY.md`.
- [x] Ejecutar las ocho suites y los validadores CLI; revisar diff completo.
