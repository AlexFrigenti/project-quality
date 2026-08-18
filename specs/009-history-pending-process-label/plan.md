# Plan: Unificación de etiqueta de estado de proceso `pending` en `history.html`

## Especificación relacionada

- `specs/009-history-pending-process-label/spec.md`

## Diseño propuesto

1. **Modificación de `dashboard/history.html`**:
   - En el objeto `processLabels` (L316-L324), actualizar:
     ```javascript
     const processLabels = {
       pass: "Saludable",
       warning: "Revisar",
       fail: "Fallo",
       unknown: "Sin evidencia",
       pending: "En curso",
       missing: "Falta",
       not_applicable: "No aplica"
     };
     ```

2. **Ampliación de `scripts/test-history-rendering.mjs`**:
   - Comprobación estática del diccionario evaluado en el contexto:
     ```javascript
     assert.equal(context.processLabels.pending, "En curso", "processLabels.pending debe ser 'En curso'");
     ```
   - Caso de renderizado de snapshot con `process: { overall: "pending" }`:
     ```javascript
     const rendered = renderSnapshot({
       snapshot: baseSnapshot,
       repository: {
         id: "gestor-autonomo",
         notApplicableAreas: [],
         process: { overall: "pending" },
         quality: { status: "unavailable", message: "Evidencia no disponible." }
       }
     });
     assert.ok(rendered.includes('<span class="fact-value">En curso</span>'), "El hecho Proceso debe mostrar 'En curso' cuando process.overall es pending");
     ```

## Archivos afectados

- Modificar:
  - `dashboard/history.html`
  - `scripts/test-history-rendering.mjs`
- Nuevos:
  - `specs/009-history-pending-process-label/spec.md`
  - `specs/009-history-pending-process-label/plan.md`
  - `specs/009-history-pending-process-label/tasks.md`
