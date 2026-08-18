# Especificación: Declaración explícita de notApplicableAreas en perfiles de auditoría

## Contexto y problema

El esquema `schemas/quality-history.schema.json`, la normalización de persistencia (`scripts/persist-quality-history.mjs`) y las vistas del dashboard (`dashboard/index.html` y `dashboard/history.html`) soportan y esperan la propiedad `notApplicableAreas` en cada repositorio auditado. Sin embargo, en `scripts/audit-repository.mjs`, la tabla `profiles` no declaraba esta propiedad en ninguno de los cuatro perfiles (`gestor-autonomo`, `nexo`, `nucleo`, `nucleo-preview`), provocando que en producción se evaluase siempre al fallback `[]` y se silenciaran las áreas que no aplican según la normativa.

## Objetivo

Declarar explícitamente en la definición de perfiles de `scripts/audit-repository.mjs` las áreas no aplicables canónicas de cada repositorio según `QUALITY_STANDARD.md`, y añadir una prueba automatizada específica que valide que los perfiles reales producen exactamente las exclusiones esperadas sin depender de mocks desacoplados.

## Distinción semántica fundamental

- `notApplicableAreas` describe las **exclusiones arquitectónicas y formales del perfil** del repositorio (e.g. un proyecto estático sin dependencias no aplica compilación ni TypeScript).
- Los gates con `applicability: "not-applicable"` en `quality-metrics.json` describen la omisión de comandos opcionales en una **ejecución dinámica concreta**.
- `notApplicableAreas` **NO** debe inferirse dinámicamente a partir de gates individuales; pertenece a la definición del perfil.

## Alcance

### Incluye

- Declarar `notApplicableAreas` en cada uno de los 4 perfiles de `scripts/audit-repository.mjs`:
  - `gestor-autonomo`: `[]` (perfil de referencia completa; todas las áreas aplican).
  - `nexo`: `["Tipos", "Cobertura", "E2E", "Smoke test"]`.
  - `nucleo`: `["Tipos", "Cobertura", "E2E"]`.
  - `nucleo-preview`: `["Instalación", "Tipos", "Build", "Cobertura", "E2E"]`.
- Exportar `profiles` en `scripts/audit-repository.mjs` y encapsular la ejecución principal como módulo comprobable.
- Crear una prueba de regresión específica `scripts/test-audit-profiles.mjs` que verifique la exportación real de los perfiles y su propagación hacia el histórico.

### Fuera de alcance

- No modificar `schemas/quality-history.schema.json` (ya define `notApplicableAreas` como array de strings).
- No modificar `dashboard/index.html` ni `dashboard/history.html` (ya renderizan `notApplicableAreas`).
- No modificar `scripts/persist-quality-history.mjs` ni `scripts/collect-quality-history.mjs`.
- No alterar otros perfiles ni la semántica de gates en `quality-metrics.json`.

## Requisitos funcionales

1. `profiles["gestor-autonomo"].notApplicableAreas` debe ser un array vacío (`[]`).
2. `profiles["nexo"].notApplicableAreas` debe contener exactamente `["Tipos", "Cobertura", "E2E", "Smoke test"]`.
3. `profiles["nucleo"].notApplicableAreas` debe contener exactamente `["Tipos", "Cobertura", "E2E"]`.
4. `profiles["nucleo-preview"].notApplicableAreas` debe contener exactamente `["Instalación", "Tipos", "Build", "Cobertura", "E2E"]`.
5. La prueba automatizada debe importar directamente `profiles` de `audit-repository.mjs` para evitar divergencias entre test y producción.

## Criterios de aceptación

- [ ] CA1: `gestor-autonomo` define `notApplicableAreas: []`.
- [ ] CA2: `nexo` define `notApplicableAreas: ["Tipos", "Cobertura", "E2E", "Smoke test"]`.
- [ ] CA3: `nucleo` define `notApplicableAreas: ["Tipos", "Cobertura", "E2E"]`.
- [ ] CA4: `nucleo-preview` define `notApplicableAreas: ["Instalación", "Tipos", "Build", "Cobertura", "E2E"]`.
- [ ] CA5: Un snapshot histórico generado a partir de un informe con estos perfiles valida exitosamente con `validateQualityHistory`.
- [ ] CA6: Todas las suites de pruebas existentes pasan al 100%.

## Casos de error y límites

- Si un perfil carece de `notApplicableAreas`, la prueba falla.
- Si las etiquetas no coinciden con las canónicas de `QUALITY_STANDARD.md` / `GATE_LABELS`, la prueba falla.
- La ejecución CLI / Actions de `scripts/audit-repository.mjs` conserva idéntico comportamiento sin romper interfaces.
