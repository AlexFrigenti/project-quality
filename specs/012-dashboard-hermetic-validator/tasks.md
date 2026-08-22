# Tareas: Validador hermético del dashboard

- [x] Confirmar la base `origin/main` `c0ca2abd77884c95a9abe39e760636cfb0e4b4ee`, la rama de trabajo y el alcance T2.
- [x] Añadir reproducciones deterministas de contadores manipulados, URLs privadas y evidencia incompleta.
- [x] Crear `scripts/dashboard-contract.mjs` sin I/O con recomposición de `summary` y validación de invariantes.
- [x] Conectar `validate-dashboard.mjs` al contrato puro conservando el CLI y sus rutas.
- [x] Hacer que `assemble-dashboard.mjs` valide antes de escribir `data.json` o copiar Pages.
- [x] Cubrir privacidad pública/privada, coherencia de evidencia y estados `pending`/`unavailable`.
- [x] Verificar compatibilidad con histórico, índice y rendering sin reescribir snapshots.
- [x] Actualizar `DASHBOARD.md` con el límite hermético del ensamblador.
- [x] Ejecutar regresión completa, `git diff --check` y revisión del diff frente a `origin/main`.
- [x] Aplicar una única ronda agrupada de correcciones tras la revisión local.
- [x] Crear el commit final local y detenerse antes de publicar.
