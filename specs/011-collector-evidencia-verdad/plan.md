# Plan: Verdad de la evidencia y fallos explícitos del collector

## Enfoque

Cambio T1 centrado en `scripts/collect-quality-evidence.mjs` con pruebas de contrato observables. No se modifica ningún schema ni contrato público serializado: `unavailable` ya está soportado por todos los consumidores.

## Pasos

1. **Reproducciones (TDD)**: extender `scripts/test-quality-evidence.mjs` con una batería determinista sobre `collectQualityEvidence` mediante inyección de `fetch` y lector de artifacts. Los casos de R1 y R2 deben fallar contra la implementación original.
2. **Implementación**:
   - Añadir parámetro opcional `deps` (`fetch`, `readArtifact`) a `collectQualityEvidence` con valores por defecto de producción.
   - Seleccionar únicamente el run completado más reciente del SHA actual y evaluarlo en una función dedicada que devuelve resultado o causa de rechazo, aplicando el orden: repositorio → SHA → rama → run.id → attempt → par de conclusiones.
   - Si el run más reciente no es utilizable, devolver `unavailable` con la causa explícita acotada a 200 caracteres, sin retroceso a ejecuciones anteriores del mismo SHA.
   - Mantener `pending` cuando no hay runs completados del SHA.
3. **Dashboard**: en `dashboard/index.html`, distinguir "Pendiente" de "Sin evidencia utilizable" en la ficha de Evidencia.
4. **Documentación**: actualizar la sección de integración de `QUALITY_METRICS.md` y el párrafo de evidencia de `DASHBOARD.md`.
5. **Validación**: suites afectadas + regresión general + `git diff --check`.

## Invariantes

- La conclusión publicada nunca puede ser `passed` si el run correspondiente no concluyó `success`.
- Un fallo conocido de evidencia nunca se representa como `pending`.
- El run completado más reciente del SHA actual es autoritativo: nunca se sustituye por una ejecución anterior del mismo SHA.
- Sin runs completados del SHA actual, sigue siendo `pending`.

## Compatibilidad

- `data.json`: sin cambios de forma; `qualityEvidence.status` admite los mismos tres valores.
- Histórico: `persist-quality-history` ya normaliza `unavailable` con mensaje; los snapshots no cambian de estructura.
- Schemas: sin cambios.
- Consumidores (`validate-dashboard.mjs`, `audit-repository.mjs`, HTML): sin cambio obligatorio; solo mejora de etiqueta en `index.html`.

## Reversión

Revertir el commit del sprint restaura el comportamiento anterior; no hay migraciones ni datos persistentes nuevos.
