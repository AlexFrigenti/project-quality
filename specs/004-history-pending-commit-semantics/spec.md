# Especificación: Semántica de commits pendientes y no disponibles en el histórico

## Contexto y problema

En `dashboard/history.html`, cuando `quality.status !== "current"` (estados `pending` o `unavailable`), el sistema utilizaba la expresión `quality.commitSha || quality.currentHeadSha` bajo la etiqueta estática `Commit validado`. Asimismo, en la tarjeta resumen superior (*Overview*), se mostraba la fecha del snapshot bajo el título `Última validación` asociándole el `currentHeadSha`.

Esto producía una anomalía semántica: presentaba commits en curso o sin evidencia como si hubieran superado exitosamente la validación de calidad.

## Distinción conceptual fundamental

- **`quality.commitSha`**: SHA inmutable del commit con evidencia validada (`quality.status === "current"`).
- **`quality.currentHeadSha`**: HEAD observado de la rama por defecto durante la auditoría que está pendiente de validación o carece de evidencia (`pending` o `unavailable`).
- **`snapshot.generatedAt`**: Timestamp en el que el dashboard ejecutó la auditoría y generó el snapshot.
- **`quality.validatedAt`**: Momento real en el que concluyó la ejecución del workflow de calidad en el repositorio consumidor (`summary.run.completedAt`).

## Objetivos

1. En las tarjetas de cada snapshot histórico:
   - Si `quality.status === "current"`: mostrar etiqueta `Commit validado` con `quality.commitSha`.
   - Si `quality.status !== "current"`: mostrar etiqueta `Commit actual` con `quality.currentHeadSha` (o `—` si no existe).
2. En la tarjeta *Overview* (`Última validación`):
   - Si el último snapshot tiene `quality.status === "current"`: mostrar `quality.validatedAt` (con fallback a `snapshot.generatedAt` si no existiera) y nota `Commit <shortSha>`.
   - Si el último snapshot tiene `quality.status !== "current"`: mostrar valor `—` y nota indicando `Commit actual <shortSha> (pendiente)` o el mensaje de estado, sin presentarlo como validación completada.
3. Añadir una prueba de regresión determinista `scripts/test-history-rendering.mjs` integrada en CI.

## Criterios de aceptación

- [ ] **CA1 (current)**: En tarjetas de snapshot, `quality.status === "current"` muestra `Commit validado` y el SHA correspondiente.
- [ ] **CA2 (pending)**: En tarjetas de snapshot, `quality.status === "pending"` muestra `Commit actual` con `currentHeadSha` (o `—`) y nunca `Commit validado`.
- [ ] **CA3 (unavailable)**: En tarjetas de snapshot, `quality.status === "unavailable"` muestra `Commit actual` con `currentHeadSha` (o `—`) y nunca `Commit validado`.
- [ ] **CA4 (Overview)**: La tarjeta de *Última validación* no atribuye una fecha de validación ni presenta como validado un commit en estado `pending` o `unavailable`.
- [ ] **CA5 (Robustez)**: Si falta `currentHeadSha` o `commitSha`, la UI renderiza `—` sin errores ni `undefined`.
- [ ] **CA6 (CI)**: La prueba `scripts/test-history-rendering.mjs` se ejecuta automáticamente en el workflow de CI.
