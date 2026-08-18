# Especificación: Coherencia de `propertyNames` en `quality-metrics`

## Contexto y problema

El contrato de métricas de calidad permite nombres dinámicos y estructuras anidadas en el mapa `metrics`.
El validador manual (`scripts/validate-quality-metrics.mjs`), el generador (`scripts/generate-quality-metrics.mjs`) y el colector (`scripts/collect-quality-evidence.mjs`) aplican uniformemente la expresión regular `^[a-zA-Z][a-zA-Z0-9_-]*$` a todos los nombres de métricas en la raíz y en subobjetos anidados.
Sin embargo, `schemas/quality-metrics.schema.json` omitía la declaración de `propertyNames`, lo que hacía que el JSON Schema formal fuese indebidamente más permisivo que el código de producción.

## Objetivos

1. Alinear formalmente `schemas/quality-metrics.schema.json` declarando:
   ```json
   "propertyNames": {
     "pattern": "^[a-zA-Z][a-zA-Z0-9_-]*$"
   }
   ```
   tanto en `properties.metrics` como en la rama de tipo objeto de `$defs.metricValue.oneOf[1]`.
2. Mantener `metrics` como un mapa extensible para claves válidas, preservando la compatibilidad total con los productores reales.
3. Ampliar `scripts/test-quality-metrics.mjs` para verificar el patrón en el schema y comprobar el rechazo determinista de nombres inválidos tanto en raíz como en estructuras anidadas.

## Exclusiones explícitas

- No se modifica la política ni la expresión regular existente (`^[a-zA-Z][a-zA-Z0-9_-]*$`).
- No se modifican `validate-quality-metrics.mjs`, `generate-quality-metrics.mjs`, `collect-quality-evidence.mjs` ni scripts del dashboard.
- `PQ-AUDIT-08` permanece fuera de alcance.

## Criterios de aceptación

- [ ] **CA1**: `schemas/quality-metrics.schema.json` declara `"propertyNames": { "pattern": "^[a-zA-Z][a-zA-Z0-9_-]*$" }` en `properties.metrics` y en `$defs.metricValue.oneOf[1]`.
- [ ] **CA2**: El schema y el código exigen exactamente la misma política de nomenclatura (primer carácter letra ASCII, caracteres posteriores alfanuméricos, guiones o guiones bajos).
- [ ] **CA3**: Se rechazan claves inválidas (que empiezan por número/guion/guion bajo, con espacios, puntos, barras, caracteres no ASCII o cadenas vacías) en raíz y en niveles anidados.
- [ ] **CA4**: Se aceptan todas las claves dinámicas válidas (planas, anidadas, CamelCase, con guiones y guiones bajos).
- [ ] **CA5**: Las 7 suites de pruebas del proyecto pasan exitosamente.
