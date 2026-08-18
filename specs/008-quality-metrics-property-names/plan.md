# Plan: Coherencia de `propertyNames` en `quality-metrics`

## Especificación relacionada

- `specs/008-quality-metrics-property-names/spec.md`

## Diseño propuesto

1. **Modificación de `schemas/quality-metrics.schema.json`**:
   - En `properties.metrics`:
     ```json
     "metrics": {
       "type": "object",
       "propertyNames": {
         "pattern": "^[a-zA-Z][a-zA-Z0-9_-]*$"
       },
       "additionalProperties": {
         "$ref": "#/$defs/metricValue"
       }
     }
     ```
   - En `$defs.metricValue.oneOf[1]`:
     ```json
     {
       "type": "object",
       "minProperties": 1,
       "propertyNames": {
         "pattern": "^[a-zA-Z][a-zA-Z0-9_-]*$"
       },
       "additionalProperties": {
         "$ref": "#/$defs/metricValue"
       }
     }
     ```

2. **Ampliación de `scripts/test-quality-metrics.mjs`**:
   - Comprobaciones del schema:
     - `schema.properties.metrics.propertyNames.pattern === "^[a-zA-Z][a-zA-Z0-9_-]*$"`
     - `schema.$defs.metricValue.oneOf[1].propertyNames.pattern === "^[a-zA-Z][a-zA-Z0-9_-]*$"`
   - Batería de casos válidos (raíz y anidados): `coverage`, `test_count`, `test-count`, `test1`, `TestMetric`, `custom_metric`, `suite-performance`, `CamelCase`.
   - Batería de casos inválidos (raíz y anidados): `1test`, `_test`, `-test`, `test.value`, `test value`, `test/value`, `test:value`, `área`, cadena vacía `""`.

## Archivos afectados

- Modificar:
  - `schemas/quality-metrics.schema.json`
  - `scripts/test-quality-metrics.mjs`
- Nuevos:
  - `specs/008-quality-metrics-property-names/spec.md`
  - `specs/008-quality-metrics-property-names/plan.md`
  - `specs/008-quality-metrics-property-names/tasks.md`
