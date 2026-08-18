# Especificación: Consistencia de cardinalidad de quality.gates en históricos

## Contexto y problema

En `schemas/quality-history.schema.json`, la propiedad `quality.gates` declaraba incondicionalmente `"minItems": 1` a nivel base. Sin embargo, en un snapshot histórico, un repositorio con `quality.status === "pending"` o `quality.status === "unavailable"` no dispone de evidencia validada para el commit actual y genera legítimamente `gates: []`. Por su parte, el validador manual `scripts/validate-quality-history.mjs` aceptaba cualquier array en `gates` sin validar la cardinalidad correspondiente a cada estado (`status === "current"` vs `status !== "current"`).

## Objetivo

Alinear formalmente el JSON Schema y el validador manual para expresar de forma consistente y determinista la invariante de cardinalidad de `quality.gates` según `quality.status`:
- `quality.status === "current"` → `quality.gates` debe contener al menos 1 elemento (`minItems: 1`).
- `quality.status === "pending"` → `quality.gates` debe ser un array vacío (`maxItems: 0`).
- `quality.status === "unavailable"` → `quality.gates` debe ser un array vacío (`maxItems: 0`).
- `quality.gates` se mantiene como propiedad obligatoria de tipo array en todos los estados.

## Alcance

### Incluye

- Ajustar `schemas/quality-history.schema.json` eliminando `minItems: 1` de la definición base de `quality.gates` y condicionando `minItems: 1` para `status === "current"` y `maxItems: 0` para `status === "pending" | "unavailable"` dentro de `allOf`.
- Ajustar `scripts/validate-quality-history.mjs` para exigir `gates.length > 0` cuando `status === "current"` y `gates.length === 0` cuando `status === "pending"` o `"unavailable"`.
- Añadir pruebas de regresión completas en `scripts/test-quality-history.mjs`.

### Fuera de alcance

- No modificar `quality.metrics` (ni en schema, ni en validador, ni en tests).
- No modificar generadores ni colectores.
- No alterar otros esquemas ni flujos no relacionados.

## Requisitos funcionales

1. El esquema `quality-history.schema.json` debe validar exitosamente snapshots con repositorios en `pending` o `unavailable` que contengan `gates: []`.
2. El esquema `quality-history.schema.json` y el validador manual deben rechazar cualquier snapshot con `status === "current"` y `gates: []`.
3. El esquema `quality-history.schema.json` y el validador manual deben rechazar cualquier snapshot con `status === "pending"` o `status === "unavailable"` y `gates.length > 0`.

## Criterios de aceptación

- [x] CA1: Un repositorio en snapshot histórico con `status === "current"` y `gates` con al menos 1 elemento es válido.
- [x] CA2: Un repositorio en snapshot histórico con `status === "current"` y `gates: []` es rechazado por el validador y el schema.
- [x] CA3: Un repositorio en snapshot histórico con `status === "pending"` y `gates: []` es válido.
- [x] CA4: Un repositorio en snapshot histórico con `status === "pending"` y gates no vacíos es rechazado por el validador y el schema.
- [x] CA5: Un repositorio en snapshot histórico con `status === "unavailable"` y `gates: []` es válido.
- [x] CA6: Un repositorio en snapshot histórico con `status === "unavailable"` y gates no vacíos es rechazado por el validador y el schema.
- [x] CA7: Todas las pruebas existentes de calidad pasan sin regresiones.

## Casos de error y límites

- Si un snapshot contiene un repositorio `current` sin gates, se lanza un error descriptivo indicando que `current` requiere gates evaluados.
- Si un snapshot contiene un repositorio `pending` o `unavailable` con gates, se lanza un error descriptivo indicando que no puede contener gates evaluados.

## Decisiones tomadas

- Se mantiene `quality.gates` como propiedad requerida en `quality`, preservando la estabilidad del contrato JSON.
- `quality.metrics` no se modifica en este sprint para respetar estrictamente el principio de alcance único.

## Riesgos y restricciones

- Riesgo mínimo: el generador ya producía `gates: []` para `pending` y `unavailable`, y `gates` no vacíos para `current`. El cambio solo alinea las reglas contractuales y de validación.
