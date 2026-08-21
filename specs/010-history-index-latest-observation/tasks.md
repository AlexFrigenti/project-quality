# Tareas: El índice histórico conserva la observación más reciente ante estados repetidos

- [x] Crear artefactos T1 (`spec.md`, `plan.md`, `tasks.md`).
- [x] Reproducir el síntoma de forma determinista con las funciones reales (`buildHistoryIndex` con entrada `[actual(T2), histórico(T1)]`).
- [x] Contrastar hipótesis alternativas (ordenador temporal, paginación, timing de persistencia) y confirmar la deduplicación como causa raíz.
- [x] Añadir regresión en `scripts/test-quality-history-index.mjs` y demostrar su fallo antes de la corrección.
- [x] Corregir `buildHistoryIndex` para conservar la observación más reciente ante ids duplicados.
- [x] Documentar la regla de recencia en `QUALITY_HISTORY.md`.
- [x] Ejecutar las suites relacionadas y verificar deduplicación, identidad y orden temporal con el validador real.
- [x] Revisar el diff completo y dejar la corrección en rama para revisión.
