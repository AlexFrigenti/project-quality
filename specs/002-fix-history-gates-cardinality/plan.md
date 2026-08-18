# Plan: Consistencia de cardinalidad de quality.gates en históricos

## Especificación relacionada

- `specs/002-fix-history-gates-cardinality/spec.md`

## Diseño propuesto

1. En `schemas/quality-history.schema.json`:
   - En `$defs.quality.properties.gates`: mantener `"type": "array"`, `"items": { "$ref": "#/$defs/gate" }` (sin `minItems: 1` global).
   - En `allOf` rama `status === "current"`: incluir `"properties": { "gates": { "minItems": 1 } }`.
   - En `allOf` rama `status === "pending" | "unavailable"`: incluir `"properties": { "gates": { "maxItems": 0 } }`.

2. En `scripts/validate-quality-history.mjs`:
   - En `validateQuality(quality, path)`:
     - Si `quality.status === "current"`: si `quality.gates.length === 0`, fallar con mensaje claro (e.g. `path + " actual debe contener al menos un gate"`).
     - Si `quality.status !== "current"`: si `quality.gates.length > 0`, fallar con mensaje claro (e.g. `path + " pendiente o no disponible no puede contener gates"`).

3. En `scripts/test-quality-history.mjs`:
   - Añadir tests para cubrir todas las combinaciones de `status` (`current`, `pending`, `unavailable`) con gates vacíos y no vacíos.
   - Añadir aserciones directas sobre la estructura del esquema `quality-history.schema.json` para verificar que `minItems: 1` y `maxItems: 0` están definidos condicionalmente según lo especificado.

## Archivos afectados

- Modificar:
  - `schemas/quality-history.schema.json`
  - `scripts/validate-quality-history.mjs`
  - `scripts/test-quality-history.mjs`
- Pruebas:
  - `scripts/test-quality-history.mjs`

## Orden de implementación

1. Actualizar `schemas/quality-history.schema.json`.
2. Actualizar `scripts/validate-quality-history.mjs`.
3. Actualizar y ampliar `scripts/test-quality-history.mjs`.
4. Ejecutar validaciones completas del proyecto.

## Estrategia de pruebas

- Pruebas unitarias de validación negativa y positiva en `test-quality-history.mjs`.
- Verificación cruzada del esquema y validador con los casos definidos en los criterios de aceptación.

## Validaciones

- `node scripts/test-quality-history.mjs`
- `node scripts/test-quality-history-index.mjs`
- `node scripts/test-quality-evidence.mjs`
- `node scripts/test-quality-metrics.mjs`

## Riesgos, compatibilidad y reversión

- Compatibilidad total con datos históricos existentes y el dashboard.
- Reversión trivial mediante restauración del commit base si fuera necesario.
