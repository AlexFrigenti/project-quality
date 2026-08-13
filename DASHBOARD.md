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

## Acceso al repositorio privado

`gestor-autonomo` y `Nexo` son privados. Para auditarlos completamente hay que crear en `project-quality` un secreto de Actions llamado `QUALITY_AUDIT_TOKEN` con un token fine-grained de solo lectura y alcance limitado a los repositorios necesarios. Sin ese secreto, el dashboard muestra esos repositorios como `Revisar` y no expone enlaces ni contenido privado.

En ejecuciones de Pull Request no se usa ese secreto: el workflow usa el token efímero de GitHub para no entregar credenciales privadas a código de una rama no confiable.

## Publicación en GitHub Pages

El workflow genera un artefacto estático y, en `main`, intenta desplegarlo en Pages. Tras fusionar este cambio:

1. Abre `Settings → Pages` en `project-quality`.
2. Selecciona `GitHub Actions` como origen de publicación si GitHub todavía pide configurarlo.
3. Ejecuta manualmente `Quality dashboard` desde `Actions` para producir la primera publicación.

El dashboard no tiene backend, base de datos ni proveedor externo. Solo contiene el informe agregado generado por Actions.

## Estado actual y evolución

La primera versión muestra una instantánea verificable. No calcula una nota global ni guarda tendencias históricas. En una iteración posterior se puede añadir histórico de ejecuciones o evolución temporal, siempre que las métricas sigan teniendo evidencia y significado para cada proyecto.
