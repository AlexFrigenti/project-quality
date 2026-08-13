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

## Contenido y privacidad

El contrato está definido en [schemas/quality-history.schema.json](schemas/quality-history.schema.json) y se valida antes de publicar. El snapshot no incluye URLs, tokens, secretos, variables de entorno, headers, logs ni salidas arbitrarias de comandos. Las referencias a `No aplica` se conservan mediante `applicability: not-applicable` en los gates.

El histórico se utilizará como fuente de la siguiente fase del dashboard. Los gráficos se añadirán después y solo representarán métricas numéricas que tengan significado real para el proyecto correspondiente.
