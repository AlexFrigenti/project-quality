# Especificación: Alineación de additionalProperties en quality-metrics

## Contexto y problema

`schemas/quality-metrics.schema.json` declara `additionalProperties: false` en los 7 objetos que componen la estructura de datos cerrada del informe:
1. Objeto raíz (`report`)
2. `project`
3. `commit`
4. `run`
5. `standard`
6. `gate` (`#/$defs/gate`)
7. `evidence` (`#/$defs/evidence`, presente en `report.evidence` y en `gate.evidence`)

Sin embargo, `scripts/validate-quality-metrics.mjs` no verificaba la exhaustividad de claves en dichos objetos, permitiendo que documentos con propiedades espurias fueran considerados válidos por el validador manual a pesar de violar el JSON Schema formal.

## Distinción entre estructuras cerradas y el mapa dinámico `metrics`

- **Estructuras cerradas (7 objetos):** Tienen un conjunto predefinido, fijo y cerrado de propiedades válidas. Toda propiedad no declarada debe ser rechazada con un error indicando su ruta.
- **Mapa dinámico `metrics`:** Está diseñado formalmente como un diccionario extensible (`additionalProperties: { "$ref": "#/$defs/metricValue" }`). Acepta claves dinámicas de métricas (números $\ge 0$ o sub-objetos anidados) cuyos identificadores cumplan el patrón permitido (`/^[a-zA-Z][a-zA-Z0-9_-]*$/`). No debe aplicarse un conjunto cerrado de claves a `metrics` ni a sus sub-objetos anidados.

## Objetivos

1. Implementar la validación exhaustiva de claves permitidas en `scripts/validate-quality-metrics.mjs` para los 7 objetos cerrados mediante el helper `keys(value, allowed, path)`.
2. Proteger tanto `report.evidence` como `gate.evidence` contra propiedades desconocidas.
3. Preservar intacta la extensibilidad legítima del mapa dinámico `metrics`.
4. Añadir tests de regresión deterministas en `scripts/test-quality-metrics.mjs`.

## Criterios de aceptación

- [ ] **CA1 (Raíz)**: `validateQualityMetrics` rechaza cualquier propiedad no declarada en el objeto raíz (`report`).
- [ ] **CA2 (Sub-objetos cerrados)**: `validateQualityMetrics` rechaza propiedades no declaradas en `project`, `commit`, `run` y `standard`.
- [ ] **CA3 (Gates)**: `validateQualityMetrics` rechaza propiedades no declaradas en cada elemento de `gates`.
- [ ] **CA4 (Evidence en ambos contextos)**: `validateQualityMetrics` rechaza propiedades no declaradas en elementos de `report.evidence` y `gate.evidence`.
- [ ] **CA5 (Ruta en mensaje de error)**: El error emitido contiene la ruta identificativa del campo desconocido (ej. `report.project.extraField no está permitido`).
- [ ] **CA6 (Extensibilidad de metrics)**: `metrics` continúa aceptando claves dinámicas válidas (números planos, sub-objetos anidados, identificadores con guion y guion bajo).
- [ ] **CA7 (Validación completa)**: Todas las pruebas del repositorio pasan sin fallos ni dependencias nuevas.

## Compatibilidad y análisis prudente de riesgos

- **Riesgo bajo/moderado:** Si algún workflow externo o script no oficial estuviera emitiendo propiedades auxiliares no contempladas en el estándar `v1.1.0`, dicho artefacto será rechazado. Esto es el comportamiento deseado para asegurar la integridad estricta del contrato.
- **Productores oficiales:** El generador oficial `scripts/generate-quality-metrics.mjs` y los workflows reutilizables `node-quality.yml` y `static-quality.yml` producen exactamente el conjunto cerrado de propiedades, por lo que no sufren impacto negativo.
