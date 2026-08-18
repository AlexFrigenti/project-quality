# Especificación: Unificación de etiqueta de estado de proceso `pending` en `history.html`

## Contexto y problema

En la interfaz de usuario de `project-quality`, el estado de proceso `pending` (que representa auditorías, workflows o checks en ejecución) se traducía como `"En curso"` en `dashboard/index.html` y en `scripts/audit-repository.mjs`.
Sin embargo, en `dashboard/history.html`, el diccionario `processLabels` asignaba a `pending` la etiqueta `"Pendiente"`, generando una inconsistencia terminológica entre las vistas del dashboard y confundiendo la semántica del estado de proceso (`process.pending` → en ejecución) con la del estado de evidencia de calidad (`quality.pending` → a la espera de evidencia validada).

## Objetivos

1. Unificar en `dashboard/history.html` el valor de `processLabels.pending` a `"En curso"`.
2. Preservar intacta la semántica de `quality.status === "pending"` (evidencia pendiente para el commit actual).
3. Ampliar `scripts/test-history-rendering.mjs` con pruebas que aseguren que `processLabels.pending === "En curso"` y que las tarjetas de snapshot con `process.overall === "pending"` muestren `En curso`.

## Exclusiones explícitas

- No se modifica `dashboard/index.html`.
- No se modifican contratos JSON Schema ni validadores de persistencia.
- No se altera la semántica ni los textos asociados a `quality.status === "pending"` o `quality.status === "unavailable"`.

## Criterios de aceptación

- [ ] **CA1**: `processLabels.pending` en `dashboard/history.html` tiene el valor `"En curso"`.
- [ ] **CA2**: Un snapshot histórico con `process.overall === "pending"` renderiza `<span class="fact-value">En curso</span>` en la sección de hechos del snapshot.
- [ ] **CA3**: Los snapshots históricos con `quality.status === "pending"` continúan mostrando la información de evidencia pendiente sin alteración.
- [ ] **CA4**: Las siete suites de pruebas del repositorio pasan exitosamente.
