# Tareas: Cobertura de tests para auditoría y ensamblado del dashboard

- [x] Crear especificaciones T1 (`spec.md`, `plan.md`, `tasks.md`).
- [x] Refactorizar `scripts/validate-dashboard.mjs` para exportar `validateDashboard` y aislar la ejecución CLI.
- [x] Refactorizar `scripts/assemble-dashboard.mjs` para exportar `assembleDashboard` y parametrizar directorios.
- [x] Crear la suite unificada `scripts/test-dashboard.mjs` con tests para `validateDashboard` y `assembleDashboard`.
- [x] Integrar `scripts/test-dashboard.mjs` en `.github/workflows/quality-dashboard.yml`.
- [x] Ejecutar las 7 suites de validación y comprobar compatibilidad CLI e importación sin efectos secundarios.
- [x] Realizar autorrevisión adversarial de refactors y pruebas.
