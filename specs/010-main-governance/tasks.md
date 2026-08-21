# Tareas: Gobernanza real de `main`

- [x] Confirmar el checkout, rama base, árbol limpio y SHA real de `origin/main`.
- [x] Leer `AGENTS.md`, `QUALITY_STANDARD.md`, `CONTRIBUTING.md`, `DASHBOARD.md`, `QUALITY_HISTORY.md`, README y documentación Spec Kit/Superpowers relevante.
- [x] Clasificar PQ-OX02 como T2 y registrar alcance, decisiones, riesgos, invariantes y compatibilidad.
- [x] Crear `spec.md`, `plan.md` y `tasks.md` en `specs/010-main-governance/`.
- [x] Escribir la prueba roja del contrato `requiredQualityCheck.context` y comprobar que falla contra la base.
- [x] Declarar `requiredQualityCheck.context` en los cuatro perfiles y comprobar la prueba en verde.
- [x] Escribir el test rojo del falso positivo sin `required_status_checks` y comprobar que falla contra la base.
- [x] Implementar la unidad pura de normalización/evaluación de main protection.
- [x] Cubrir rulesets activos, aplicabilidad, métodos de merge, required checks, bypasses y estados `fail`/`unknown`.
- [x] Añadir soporte equivalente y conservador para branch protection clásica.
- [x] Integrar el resultado en `audit-repository.mjs` sin cambiar los contratos públicos existentes.
- [x] Añadir prueba determinista de integración del auditor.
- [x] Mantener regresiones de perfiles, `data.json`, histórico y dashboard.
- [x] Actualizar la documentación contractual y los filtros de paths del workflow.
- [x] Ejecutar suites afectadas, regresión general y `git diff --check`.
- [x] Realizar una única revisión independiente y una ronda agrupada de correcciones para los falsos verdes detectados.
- [x] Crear el commit local final y detenerse sin `push`, PR, merge ni despliegue.
