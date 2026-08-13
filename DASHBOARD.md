# Dashboard visual de calidad

Este repositorio genera un panel estático con la foto actual de calidad técnica de:

- `AlexFrigenti/gestor-autonomo` — perfil Node.js de referencia.
- `AlexFrigenti/Nexo` — perfil Node.js adaptado a contenido.
- `AlexFrigenti/Nucleo` — perfil Node.js adaptado al juego.
- `AlexFrigenti/Nucleo-preview` — perfil estático para el preview.

## Qué audita

El workflow `.github/workflows/quality-dashboard.yml` ejecuta una matriz de cuatro auditorías independientes. Cada auditoría comprueba únicamente evidencia real:

- rama por defecto `main`;
- ruleset activo con PR obligatorio, merge commit, bloqueo de borrado y bloqueo de force push;
- workflow de calidad existente;
- consumo del workflow reutilizable en el commit estable de `project-quality`;
- comandos que el perfil declara como relevantes;
- última ejecución de calidad sobre la rama principal.

Los proyectos no comparten arquitectura, dependencias ni una lista artificial de checks. `No aplica` no se convierte en fallo y la ausencia de evidencia se muestra como revisión pendiente.

Además del proceso, el dashboard consume el artifact real `quality-metrics` de cada workflow. Solo acepta una ejecución completada cuyo SHA coincida exactamente con el HEAD de `main`. El informe se valida contra el contrato, se reduce a campos seguros y se incorpora como:

- conclusión real del workflow;
- gates con applicability y status;
- métricas numéricas disponibles;
- commit y fecha de validación;
- enlace a la ejecución cuando el repositorio es público.

Si todavía no existe evidencia para ese commit, el panel muestra `Evidencia pendiente para el commit actual`. Eso no se interpreta automáticamente como un fallo de calidad.

## Acceso al repositorio privado

`gestor-autonomo` y `Nexo` son privados. Para auditarlos completamente hay que configurar en `project-quality` un secreto de Actions con un token fine-grained de solo lectura y alcance limitado a los repositorios necesarios. Sin esas credenciales, el dashboard muestra esos repositorios como `Revisar` y no expone enlaces ni contenido privado.

En ejecuciones de Pull Request no se usa ese secreto: el workflow usa el token efímero de GitHub para no entregar credenciales privadas a código de una rama no confiable.

## Publicación en GitHub Pages

El workflow genera un artefacto estático y, en `main`, intenta desplegarlo en Pages. Tras fusionar este cambio:

1. Abre `Settings → Pages` en `project-quality`.
2. Selecciona `GitHub Actions` como origen de publicación si GitHub todavía pide configurarlo.
3. Ejecuta manualmente `Quality dashboard` desde `Actions` para producir la primera publicación.

El dashboard no tiene backend, base de datos ni proveedor externo. Solo contiene el informe agregado generado por Actions.

## Histórico persistente

El workflow conserva snapshots sanitizados en releases mensuales de `project-quality`. Cada release usa el formato `quality-history-YYYY-MM` y cada snapshot se publica como un asset inmutable `quality-snapshot-<sha256>.json`.

El identificador se calcula a partir del estado normalizado de los cuatro proyectos, sus commits validados, gates, métricas y controles de proceso. Una reejecución idéntica no crea otro snapshot. Si no existe ninguna evidencia actual validada, no se inventa una entrada histórica.

El contrato y las reglas de privacidad están documentados en [QUALITY_HISTORY.md](QUALITY_HISTORY.md). Los gráficos de evolución se añadirán en una fase posterior y solo usarán métricas cuantificables reales.

## Estado actual y evolución

La versión actual combina la auditoría de proceso con la evidencia real del commit actual. No calcula una nota global ni porcentajes artificiales. El histórico persistente ya conserva los estados validados fuera de la retención de artifacts y prepara la siguiente fase: lectura de snapshots y gráficos de evolución.
