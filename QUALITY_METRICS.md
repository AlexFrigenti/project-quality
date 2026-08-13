# Contrato de métricas de calidad

Este contrato define la evidencia estructurada que producen los workflows reutilizables de project-quality. Su objetivo es permitir que el dashboard lea resultados reales sin convertir proyectos distintos en una lista artificial de checks.

## Artefacto

Cada workflow consumidor que adopte esta versión del estándar debe publicar un artifact llamado quality-metrics. El artifact contiene un único archivo:

quality-metrics.json

El informe se genera incluso cuando falla un gate de calidad. Los errores de infraestructura que impidan hacer checkout o ejecutar el generador pueden impedir la publicación del artifact y deben tratarse como un fallo de ejecución del workflow, no como una métrica del proyecto.

## Campos principales

El informe contiene:

- schemaVersion;
- project: identificador, nombre, repositorio y tipo;
- commit: SHA, ref, rama y evento;
- run: workflow, run ID, intento, fechas y URL;
- standard: versión y SHA inmutable del estándar;
- conclusion: passed, failed o unknown;
- gates;
- metrics;
- evidence.

Cada gate declara:

- applicability: required, optional o not-applicable;
- status: passed, failed, skipped, not-applicable o unknown;
- detalles sanitizados;
- referencias de evidencia.

Un gate optional puede aportar información sin bloquear la conclusión global. Los gates required determinan la conclusión. Un gate not-applicable no se interpreta como fallo.

## Métricas numéricas

Los repositorios pueden pasar un metrics-command al workflow reutilizable. Ese comando debe escribir el archivo indicado por metrics-file. El contenido puede ser directamente un objeto de métricas o un objeto con una propiedad metrics:

{
  "metrics": {
    "tests": {
      "total": 10,
      "passed": 10,
      "failed": 0
    },
    "coverage": {
      "lines": 86.4,
      "branches": 78.1,
      "functions": 90.0,
      "statements": 87.2
    }
  }
}

Solo se aceptan números no negativos y objetos cuyos valores finales sean números. No se copian textos, logs, headers, variables de entorno ni salidas arbitrarias al informe público.

Si una métrica no puede obtenerse de forma fiable, se omite. No debe rellenarse con cero ni con una estimación.

## Inputs nuevos del reusable workflow

node-quality.yml y static-quality.yml requieren:

- standard-version: versión publicada del estándar;
- standard-sha: SHA de 40 caracteres del estándar que debe utilizarse.

Ambos inputs mantienen la relación entre el workflow consumidor y el código que genera el informe. El workflow recupera el generador desde project-quality usando ese SHA inmutable.

Los inputs opcionales son:

- metrics-command;
- metrics-file.

El workflow conserva los gates existentes y solo añade la generación, validación y publicación de evidencia.

## Seguridad

El informe no debe incluir secretos ni datos privados. El generador solo incorpora métricas numéricas y referencias a la ejecución del workflow. Las páginas públicas no reciben tokens ni logs completos.

## Alcance de esta primera integración

Esta primera integración define y publica el contrato común. Todavía no modifica los workflows consumidores ni el collector del dashboard. Esos cambios se harán en PRs independientes después de publicar una versión estable del estándar.
