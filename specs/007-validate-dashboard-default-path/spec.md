# Especificación: Corrección de la ruta por defecto en `validate-dashboard.mjs`

## Contexto y problema

`scripts/validate-dashboard.mjs` utilizaba por defecto la ruta `dashboard/data.json` cuando se ejecutaba como script CLI sin argumentos. Sin embargo, el pipeline del proyecto y el script `assemble-dashboard.mjs` generan el archivo final en `site/data.json`. La ruta `dashboard/data.json` nunca existió en producción, lo que provocaba un fallo con `ENOENT` si un desarrollador o proceso ejecutaba `node scripts/validate-dashboard.mjs` de forma manual o desasistida.

## Objetivos

1. Modificar el valor por defecto en `scripts/validate-dashboard.mjs` para que utilice `site/data.json` en lugar de `dashboard/data.json`.
2. Preservar intacta la posibilidad de pasar una ruta explícita mediante el primer argumento CLI (`process.argv[2]`).
3. Ampliar `scripts/test-dashboard.mjs` con pruebas deterministas de subproceso CLI que cubran:
   - Invocación sin argumentos cuando `site/data.json` está presente (éxito, exit code 0).
   - Invocación con ruta explícita arbitraria (éxito, exit code 0).
   - Invocación sin argumentos cuando `site/data.json` está ausente (error, exit code 1 y mención explícita a `site/data.json`).

## Exclusiones explícitas

- `PQ-AUDIT-07` (`propertyNames` en `quality-metrics.schema.json`): Fuera de alcance.
- `PQ-AUDIT-08`: Fuera de alcance.
- `scripts/assemble-dashboard.mjs`: No requiere modificaciones.
- `.github/workflows/quality-dashboard.yml`: No requiere modificaciones.

## Criterios de aceptación

- [ ] **CA1**: `validate-dashboard.mjs` resuelve `site/data.json` por defecto si no se le pasa argumento.
- [ ] **CA2**: La invocación CLI sin argumentos con `site/data.json` existente finaliza con exit code 0 y salida conforme.
- [ ] **CA3**: La invocación CLI con argumento explícito valida el archivo especificado y finaliza con exit code 0.
- [ ] **CA4**: La invocación CLI sin argumentos sin `site/data.json` finaliza con exit code 1 e informa error de ruta hacia `site/data.json`.
- [ ] **CA5**: Todas las pruebas existentes en `scripts/test-dashboard.mjs` y demás suites del proyecto pasan exitosamente.
