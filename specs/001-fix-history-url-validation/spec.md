# Especificación: Corrección de falso positivo en validación de URLs en snapshots históricos

## Contexto y problema

En `scripts/validate-quality-history.mjs`, la función `validateQualityHistory` comprueba la ausencia de URLs y campos de URL ejecutando una expresión regular sobre el JSON serializado:
`/(https?:\/\/|(^|["'])url("|:))/i.test(JSON.stringify(snapshot))`

Si un campo de texto legítimo (como `details` de un gate o `message` de calidad) comienza con la palabra `url:` (por ejemplo, `details: "url: no requerida"`), la serialización genera `"details":"url: no requerida"`. La regex detecta `"url:` y rechaza indebidamente el snapshot con el error `"El histórico no puede contener URLs"`.

## Objetivo

Reemplazar la comprobación por expresión regular sobre la cadena JSON serializada por una validación estructural segura de claves de objetos y valores de cadenas, evitando falsos positivos cuando el texto descriptivo contiene la palabra `url:`.

## Alcance

### Incluye

- Modificar `validate-quality-history.mjs` para validar estructuralmente que no existan claves prohibidas `url` en los objetos del snapshot y que ningún valor de cadena contenga URLs con esquema `https?://`.
- Añadir una prueba de regresión en `scripts/test-quality-history.mjs`.

### Fuera de alcance

- Modificaciones en schemas JSON.
- Cambios en scripts de persistencia o recolección.
- Modificaciones en el dashboard frontend (`dashboard/`).

## Usuarios y escenarios

- Un workflow o proceso que valida un snapshot histórico con descripciones de gates legítimas como `url: no requerida` debe considerarse válido sin ser rechazado falsamente.

## Requisitos funcionales

1. `validateQualityHistory` debe rechazar cualquier snapshot que contenga una propiedad con nombre `url` (insensible a mayúsculas/minúsculas).
2. `validateQualityHistory` debe rechazar cualquier snapshot donde una cadena contenga una URL que comience por `http://` o `https://`.
3. `validateQualityHistory` no debe rechazar descripciones o textos válidos que comiencen o contengan `url:` sin ser URLs reales ni claves prohibidas.

## Criterios de aceptación

- [x] Un snapshot con `details: "url: no requerida para el gate"` pasa la validación de `validateQualityHistory`.
- [x] Un snapshot con una clave de objeto `url` es rechazado.
- [x] Un snapshot con una URL real `https://ejemplo.com` en cualquier valor de texto es rechazado.
- [x] Todas las pruebas existentes continúan pasando.

## Casos de error y límites

- Objetos anidados con claves `url` deben ser detectados y rechazados recursivamente.
- Cadenas con `http://` o `https://` deben ser detectadas y rechazadas.

## Decisiones pendientes

- Ninguna.

## Riesgos y restricciones

- Riesgo bajo: La validación estructural es más precisa que la comprobación por regex sobre el string JSON global.
