# Especificación: Validador hermético del dashboard

## Contexto y problema

PQ-OX02 se fusionó en `main` mediante el commit `c0ca2abd77884c95a9abe39e760636cfb0e4b4ee`. La nueva base mantiene dos debilidades en el contrato del dashboard:

1. `scripts/validate-dashboard.mjs` comprueba algunos estados, identificadores, contadores y fugas de evidencia, pero no valida todos los campos que consumen Pages ni recomputa todos los agregados declarados.
2. `scripts/assemble-dashboard.mjs` calcula un `summary`, escribe `site/data.json` y deja que una validación posterior del workflow descubra inconsistencias. La función de ensamblado no es hermética por sí misma.

La reproducción sobre `origin/main` demuestra que el validador acepta un `summary.protectedMain` de `0` aunque los cuatro informes declaren `governance.ruleset.status: "pass"`. También acepta URLs en campos de un repositorio privado como `repository.url`, `workflow.url`, `governance.ruleset.url`, `qualityRun.url` y `checks[].evidenceUrl`. Además, el ensamblador puede escribir un informe con `qualityEvidence.status: "current"` sin `summary`; el paso posterior de CI lo rechaza, pero la API de ensamblado ya produjo el artefacto inconsistente.

## Objetivo

Hacer que el contrato que llega a GitHub Pages sea verificable y fail-closed:

- ningún agregado se acepta por confianza en el valor declarado;
- los informes deben ser internamente coherentes en los campos que consumen el dashboard y el histórico;
- los repositorios privados no pueden exponer URLs ni referencias de evidencia públicas;
- `assembleDashboard` debe validar el objeto completo antes de escribir el sitio;
- los estados desconocidos, incompletos o no utilizables nunca se convierten en verde.

## Clasificación y alcance

Cambio **T2**: afecta al contrato público de `data.json`, al ensamblado y a los consumidores Pages/histórico, aunque no modifica la forma del histórico ni el `schemaVersion`.

### Incluye

- Contrato puro y testeable para `data.json`.
- Recomposición y comparación de todos los contadores actuales de `summary`.
- Validación estructural de los campos consumidos por `dashboard/index.html`, `dashboard/history.html` y `persist-quality-history.mjs`.
- Validación de coherencia entre `overall`, checks, gobernanza, workflow, `qualityRun` y `qualityEvidence`.
- Política de privacidad para URLs y campos de evidencia en informes privados.
- Validación previa a la escritura en `assembleDashboard`.
- Reproducciones deterministas y regresiones del dashboard, histórico y CLI.
- Documentación del nuevo límite de confianza del ensamblador.

### Fuera de alcance

- Cambiar `schemaVersion` o crear una migración de JSON Schema.
- Reescribir, migrar, podar o cambiar la identidad de snapshots históricos.
- Modificar el collector de evidencia, los workflows reutilizables o la gobernanza de `main`.
- Rediseñar los HTML del dashboard.
- Resolver CRLF/Windows, consolidar todos los schemas o refactorizar globalmente el auditor.
- Añadir dependencias externas como Ajv.

## Contrato funcional

### 1. Raíz y conjunto de repositorios

`validateDashboard(value)` debe comprobar:

- `schemaVersion === 1`;
- `generatedAt` es una fecha ISO válida;
- `source` contiene el repositorio del dashboard, commit y referencia estable con forma válida;
- existen exactamente los cuatro identificadores canónicos: `gestor-autonomo`, `nexo`, `nucleo` y `nucleo-preview`;
- no hay identificadores duplicados ni repositorios desconocidos.

### 2. Agregados recomputados

Una función pura compartida por el validador y el ensamblador debe calcular desde `repositories`:

- `total`;
- `pass`, `warning` y `fail` según `overall`;
- `protectedMain` según `governance.ruleset.status === "pass"`;
- `pinnedWorkflows` según `workflow.status === "pass"`;
- `qualityGreen` según `qualityRun.status === "pass"`;
- `qualityCurrent` según `qualityEvidence.status === "current"`;
- `qualityPending` según `qualityEvidence.status === "pending"`;
- `accessRequired` según `repository.access === "required"`.

Todos los valores declarados en `summary` deben ser enteros no negativos y coincidir exactamente con el resultado recomputado. No se añade un contador nuevo para `unavailable`; ese estado sigue siendo distinguible en cada informe y no se cuenta como `pending`.

### 3. Coherencia interna de cada informe

El validador debe comprobar, como mínimo:

- metadatos del repositorio, perfil, visibilidad, acceso, rama estable y SHA;
- forma y estados de `governance.ruleset`, `workflow`, `qualityRun`, `checks`, `issues` y `overall`;
- si existe `main-protection`, su estado coincide con `governance.ruleset.status`;
- si existe `quality-workflow`, su estado coincide con `workflow.status`;
- si existe `latest-quality-run`, su estado coincide con la proyección de `qualityEvidence`;
- `overall` coincide con la regla ya usada por el auditor: acceso requerido produce `warning`; un check fallido produce `fail`; estados de revisión producen `warning`; el resto produce `pass`;
- evidencia `current`: el HEAD, el SHA validado y el SHA del resumen coinciden; la rama es la estable; la conclusión es válida; existe al menos un gate; los gates, métricas y metadatos de ejecución tienen forma válida; `qualityRun` refleja esa misma conclusión y ejecución;
- evidencia `pending` o `unavailable`: mensaje presente, sin resumen ni gates, sin SHA validado, y `qualityRun` no puede aparecer como `pass`;
- los estados `unavailable` no se cuentan como `pending`.

### 4. Privacidad y seguridad

Para cada informe privado:

- `repository.url`, `workflow.url`, `governance.ruleset.url`, `qualityRun.url` y `checks[].evidenceUrl` deben estar ausentes o ser `null`;
- el resumen de evidencia no puede contener `run.url` ni `summary.evidence`;
- las evidencias de gates no pueden contener URLs;
- ningún campo anidado puede contener una URL real, aunque el campo no sea todavía conocido por el validador;
- el escaneo existente de patrones de tokens se conserva.

En informes públicos se aceptan los enlaces GitHub que ya producen los auditores, sin hacer consultas de red durante la validación. Los campos URL presentes deben ser strings URL válidas.

### 5. Ensamblado fail-closed

`assembleDashboard` debe:

1. leer los cuatro informes;
2. ordenar los informes de forma canónica;
3. recomponer `summary` con la función pura compartida;
4. construir el objeto completo;
5. ejecutar `validateDashboard(data)` antes de escribir `site/data.json` o copiar las páginas;
6. solo después generar el sitio.

Un informe inválido debe hacer fallar el ensamblado y no debe producir un `data.json` utilizable para Pages. El paso independiente `node scripts/validate-dashboard.mjs site/data.json` del workflow se conserva como defensa adicional.

## Decisiones de diseño

- Se crea una unidad pequeña `scripts/dashboard-contract.mjs` sin I/O, que exporta la validación y la recomposición de agregados. `validate-dashboard.mjs` queda como adaptador CLI y `assemble-dashboard.mjs` consume el mismo contrato.
- No se añade Ajv ni otro runtime de schemas: el contrato actual contiene invariantes entre campos que requieren lógica explícita y ya existe una infraestructura Node determinista.
- No se modifica el histórico: `persist-quality-history.mjs` seguirá leyendo snapshots antiguos y los nuevos solo recibirán datos que hayan superado el contrato del dashboard.
- No se cambia el HTML: la corrección se sitúa en la frontera de datos antes de Pages.
- La validación no hace red ni intenta comprobar que una URL remota exista; solo valida forma y privacidad.

## Criterios de aceptación

- [ ] Un `summary.protectedMain` manipulado es rechazado aunque el resto del dashboard sea válido.
- [ ] Se recomputan y validan todos los contadores actuales de `summary`.
- [ ] Una URL en cualquier campo URL conocido de un informe privado es rechazada.
- [ ] Una URL real en un campo anidado desconocido de un informe privado es rechazada.
- [ ] Un informe `current` sin resumen, sin gates, con SHA incoherente o con `qualityRun` incompatible es rechazado.
- [ ] Un informe `pending` o `unavailable` con resumen/gates o `qualityRun.status: "pass"` es rechazado.
- [ ] Los cuatro perfiles existentes y los informes públicos/privados válidos siguen siendo aceptados.
- [ ] `assembleDashboard` rechaza un informe inválido antes de crear `data.json`.
- [ ] El CLI de `validate-dashboard.mjs` mantiene su ruta por defecto y sus rutas explícitas.
- [ ] Los snapshots históricos existentes siguen siendo legibles y no se modifican.
- [ ] Las suites de dashboard, histórico, perfiles, evidencia, índice y regresión general pasan.
- [ ] `git diff --check` queda limpio y no se añaden dependencias ni secretos.

## Riesgos y mitigaciones

- **Informes manuales o de productores no oficiales:** el contrato será más estricto; se mitiga con fixtures alineados con el productor oficial y mensajes de error concretos.
- **Duplicación de reglas entre auditor y validador:** se limita al contrato de salida del dashboard; no se refactoriza el auditor completo.
- **Falsos positivos de privacidad por textos descriptivos:** se detectan URLs reales y campos URL conocidos, no la mera palabra `url`.
- **Compatibilidad histórica:** no se reescriben snapshots; se conserva la validación existente de sus formatos.

## Reversión

Revertir el commit del sprint restaura el comportamiento anterior. No hay migraciones, cambios de schema ni datos persistentes nuevos.
