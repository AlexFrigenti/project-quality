# Tareas: PQ-OX17 — Retry único en la ruta productiva

- [ ] Confirmar base d98667b70c7119d7709e5bc2203b92f479fe7886 y árbol limpio
- [ ] Crear rama feat/pq-ox17-single-production-retry
- [ ] Escribir specs/016-single-production-retry/spec.md con evidencia del doble retry y criterios
- [ ] Escribir specs/016-single-production-retry/plan.md con TDD 1-10
- [ ] Escribir specs/016-single-production-retry/tasks.md (este archivo)
- [ ] Añadir prueba RED collectQualityHistory con deps.fetch y 503x3 -> espera 3 llamadas
- [ ] Añadir prueba RED persistSnapshot con deps.fetch y 503x3 -> espera 3 llamadas
- [ ] Ejecutar pruebas contra main y documentar fallo (9 llamadas)
- [ ] Corregir collectQualityHistory eliminando withRetry(resilientFetch(...))
- [ ] Corregir persist-quality-history.mjs (resilientGetTag, findAssetResilient) idem
- [ ] Verificar GREEN (3 llamadas)
- [ ] Verificar GET definitivos no reintentan (401 -> 1 llamada)
- [ ] Verificar Retry-After y X-RateLimit-Reset
- [ ] Verificar POST una sola tentativa y reconciliación <=2 POST
- [ ] Ejecutar 18 suites y nuevas regresiones
- [ ] Revisar diff completo (collect, persist y test)
- [ ] Commit documental con solo tres archivos de spec