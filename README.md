# project-quality

Estándar compartido de calidad, CI y flujo de trabajo para los proyectos de AlexFrigenti.

Este repositorio no contiene código de una aplicación concreta. Contiene reglas, documentación y workflows reutilizables para que proyectos como `gestor-autonomo`, Nexo, Núcleo y `Nucleo-preview` mantengan una calidad técnica coherente sin forzarles la misma arquitectura.

## Qué contiene

- [QUALITY_STANDARD.md](QUALITY_STANDARD.md): contrato común de calidad.
- [QUALITY_METRICS.md](QUALITY_METRICS.md): contrato de evidencia estructurada producido por los workflows.
- [QUALITY_HISTORY.md](QUALITY_HISTORY.md): contrato y persistencia del histórico sanitizado.
- [schemas/quality-history.schema.json](schemas/quality-history.schema.json): esquema versionado de cada snapshot histórico.
- [schemas/quality-history-index.schema.json](schemas/quality-history-index.schema.json): esquema del índice que consume GitHub Pages.
- [DASHBOARD.md](DASHBOARD.md): auditoría de proceso y evidencia real en GitHub Pages.
- [CONTRIBUTING.md](CONTRIBUTING.md): flujo de trabajo para cambios y Pull Requests.
- [AGENTS.md](AGENTS.md): instrucciones para agentes de IA que trabajen en los repositorios.
- [.github/pull_request_template.md](.github/pull_request_template.md): checklist común de revisión.
- [.github/workflows/node-quality.yml](.github/workflows/node-quality.yml): workflow reutilizable para proyectos Node.js.
- [.github/workflows/static-quality.yml](.github/workflows/static-quality.yml): workflow reutilizable para proyectos estáticos o previews sin dependencias de aplicación.

## Principio central

Se comparte el nivel de exigencia, no la implementación concreta.

Cada proyecto debe adaptar sus comandos, pruebas, cobertura y validaciones a su arquitectura. No se deben copiar dependencias, migraciones, bindings, reglas fiscales ni infraestructura específica de otro repositorio.

## Uso

1. Lee el contrato de calidad.
2. Audita el proyecto consumidor antes de añadir controles.
3. Crea una rama de trabajo.
4. Añade un workflow llamando al perfil adecuado.
5. Corrige primero la deuda existente o deja registrada una línea base explícita.
6. Protege `main` para exigir Pull Request y checks correctos.
7. Revisa y fusiona únicamente después de que las validaciones pasen.

Los workflows compartidos deben consumirse mediante una versión estable o un commit fijado, no siguiendo cambios accidentales de una rama de desarrollo.

## Ejemplo de consumo Node.js

En el repositorio consumidor, crea un workflow como este y sustituye `<COMMIT_SHA>` por el SHA estable de esta workflow:

```yaml
name: Quality

on:
  pull_request:
  push:
    branches: [main]

jobs:
  quality:
    uses: AlexFrigenti/project-quality/.github/workflows/node-quality.yml@<COMMIT_SHA>
    with:
      install-command: npm ci
      lint-command: npm run lint
      typecheck-command: npm run typecheck
      build-command: npm run build
      test-command: npm test
      coverage-command: npm run test:coverage
      e2e-command: npm run test:e2e
      smoke-command: npm run test:smoke
```

En el workflow Node, los comandos opcionales pueden omitirse cuando no apliquen. La instalación reproducible presupone que el proyecto mantiene su lockfile.

## Ejemplo de consumo de un proyecto estático

Los proyectos sin `package.json`, como una preview web experimental, no deben forzar `npm ci`, lint o cobertura artificial. Deben aportar una validación determinista propia y, si procede, un smoke del artefacto:

```yaml
name: Quality

on:
  pull_request:
  push:
    branches: [main]

jobs:
  quality:
    uses: AlexFrigenti/project-quality/.github/workflows/static-quality.yml@<COMMIT_SHA>
    with:
      validation-command: node scripts/validate-preview.mjs
      smoke-command: node scripts/smoke-preview.mjs
```

La validación no debe limitarse a devolver un código cero: debe comprobar contratos reales del proyecto, como referencias de recursos, versiones, artefactos o invariantes de estado.

## Histórico persistente

El workflow del dashboard guarda snapshots sanitizados de los estados validados en releases mensuales de GitHub. No se crean commits automáticos sobre `main`, no se duplica una reejecución idéntica y no se calculan puntuaciones artificiales.

La página [Evolución histórica](dashboard/history.html) lee un índice generado en cada ejecución de `main`, permite filtrar por proyecto y muestra commits, estados, gates, métricas reales y elementos `No aplica`. Consulta [QUALITY_HISTORY.md](QUALITY_HISTORY.md) para el contrato y las reglas de deduplicación.
