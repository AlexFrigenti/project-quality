# Histórico persistente de calidad

El histórico conserva snapshots sanitizados del estado real de los cuatro proyectos auditados. No es una puntuación ni una copia de logs: cada snapshot contiene estados de proceso, gates, métricas numéricas disponibles y los commits de `main` que hayan sido validados.

## Persistencia

El workflow `Quality dashboard` crea o reutiliza un release mensual con el formato:

```text
quality-history-YYYY-MM
```

Cada snapshot se publica como un asset inmutable con el formato:

```text
quality-snapshot-<sha256>.json
```

El identificador se calcula a partir del estado normalizado de los proyectos, sus gates, sus métricas y el estándar utilizado. Por tanto:

- una reejecución del mismo estado no crea otro asset;
- un nuevo commit validado de cualquier `main` puede generar un snapshot nuevo;
- una ejecución sin ninguna evidencia actual validada no se incorpora al histórico;
- un proyecto pendiente puede aparecer dentro de un snapshot, pero nunca se presenta como calidad aprobada.

Los assets se agrupan por mes en releases de `project-quality`, evitando commits automáticos sobre `main` y sobreviviendo a la retención limitada de los artifacts de Actions.

## Identidad del snapshot

El identificador `id` (SHA-256) se deriva de una proyección semántica del contenido, versionada mediante el campo opcional `identityVersion`:

- **Versión 1 (legacy)**: los snapshots históricos publicados antes de la identidad versionada no incluyen `identityVersion` y se interpretan como versión 1. Su proyección conserva el comportamiento histórico completo para que los assets existentes sigan validando con su identificador original. Los assets inmutables nunca se reescriben ni renombran.
- **Versión 2 (actual)**: los snapshots nuevos declaran `identityVersion: 2`. La identidad es una whitelist canónica y determinista que incluye `schemaVersion`, `identityVersion`, `standard`, los repositorios ordenados por `id` con su nombre y `kind`, `notApplicableAreas`, el estado semántico de proceso (`overall`, `mainProtection`, `workflow` y checks con `id` y `status`) y el estado semántico de calidad (`status`, `commitSha` o `currentHeadSha`, `conclusion`, gates con `id`, `applicability` y `status`, y métricas).

La identidad v2 excluye deliberadamente los campos transitorios o de presentación: `generatedAt`, `dashboardCommitSha`, `validatedAt`, mensajes de evidencia pendiente, etiquetas y detalles textuales de los gates, y `visibility`. Esos campos se conservan en el snapshot para trazabilidad y presentación, pero no definen su identidad. Por tanto, una reejecución del mismo estado semántico no crea otro asset aunque cambien las marcas temporales o los textos.

Cualquier valor de `identityVersion` distinto de 1 o 2 se rechaza en la validación del snapshot y del índice.

## Índice y vista del dashboard

Antes de desplegar Pages, el workflow lee los releases históricos, descarga sus assets mediante el token efímero de Actions, valida cada snapshot y genera `history.json`. El índice se incorpora al mismo artefacto estático que `data.json` y no contiene URLs, credenciales ni datos de autenticación.

La vista [Evolución histórica](dashboard/history.html) permite filtrar por proyecto y muestra una línea temporal de:

- commits de `main` validados;
- estado del proceso;
- conclusión de calidad;
- gates y su estado real;
- métricas numéricas disponibles;
- controles declarados como `No aplica`.

La página no convierte los gates booleanos en porcentajes. La vista de evolución dibuja únicamente series numéricas con al menos dos snapshots validados del proyecto seleccionado. Los valores ausentes se omiten, y una métrica con una sola observación permanece visible en el snapshot pero no se presenta como una tendencia.

## Contenido y privacidad

El contrato de cada snapshot está definido en [schemas/quality-history.schema.json](schemas/quality-history.schema.json), y el contrato del índice en [schemas/quality-history-index.schema.json](schemas/quality-history-index.schema.json). Ambos se validan antes de publicar.

Los snapshots y el índice no incluyen URLs, tokens, secretos, variables de entorno, headers, logs ni salidas arbitrarias de comandos. Las referencias a `No aplica` se conservan mediante `applicability: not-applicable` en los gates.

Los repositorios privados solo se consultan durante el workflow con el mecanismo de autenticación ya configurado. GitHub Pages recibe únicamente el índice y los snapshots sanitizados.

## Reglas estructurales y semánticas

Los snapshots y el índice usan fechas RFC3339 con zona horaria explícita. Los nombres de métricas mantienen el patrón `^[a-zA-Z][a-zA-Z0-9_-]*$`; los IDs de gates, checks y repositorios tienen un máximo de 80 caracteres, y el nombre completo del repositorio un máximo de 200. La relación entre aplicabilidad y estado de los gates está definida en ambos schemas y en el validador.

El validador ejecutable conserva además límites de seguridad para métricas (100 valores y profundidad máxima 6), unicidad de repositorios y de IDs de checks y gates dentro de cada repositorio, identidad derivada del snapshot, orden temporal del índice y rechazo global de URLs o tokens. Estas reglas dependen del contenido completo o del contexto del histórico y no se sustituyen por declaraciones estructurales del JSON Schema.
