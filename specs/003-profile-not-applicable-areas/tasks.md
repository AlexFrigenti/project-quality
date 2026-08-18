# Tareas: Declaración explícita de notApplicableAreas en perfiles de auditoría

- [x] Confirmar alcance y criterios de aceptación.
- [x] Modificar `scripts/audit-repository.mjs` para declarar `notApplicableAreas` en `profiles` y permitir importación segura.
- [x] Crear prueba automatizada de regresión `scripts/test-audit-profiles.mjs`.
- [x] Ejecutar `node scripts/test-audit-profiles.mjs`.
- [x] Ejecutar suite completa de contratos (`test-quality-metrics.mjs`, `test-quality-history.mjs`, `test-quality-history-index.mjs`, `test-quality-evidence.mjs`).
- [x] Comprobar propagación hacia snapshots históricos.
- [x] Revisar diff completo respecto a `main`.
