# Plan: PQ-OX17 — Retry único en la ruta productiva

## Enfoque
- TDD estricto: prueba RED → corrección mínima → GREEN → verificación.
- No ampliar alcance.

## Secuencia TDD

1. **Añadir prueba RED sobre `collectQualityHistory` usando únicamente `deps.fetch`**

   - Ubicación: `scripts/test-history-production-path.mjs` (o `test-history-api-resilience.mjs` si se prefiere agrupar).
   - Fixture: `deps.fetch` cuenta llamadas, `sleep` inyectado a 0 ms, `now` fijo.
   - Escenario: `fetch` responde `503` dos veces luego `200` con releases válidos y un asset válido. O directamente `503×3` con `Retry-After` y verificar que el número de llamadas es exactamente 3.
   - Aserción: `calls === 3`.
   - Estado actual: con doble envoltura, `calls` será 9 → RED.

2. **Añadir prueba RED equivalente para `persistSnapshot`**

   - Ubicación: mismo fichero o `test-persist-production-path`.
   - Escenario: `deps.fetch` para `GET /releases/tags/{tag}` con `503×3`.
   - Aserción: 3 llamadas, no 9.

3. **Ejecutar contra `main` y registrar fallo**

   - `node scripts/test-history-production-path.mjs` → debe fallar con `9 !== 3`.
   - Guardar salida como evidencia RED.

4. **Corrección mínima**

   - `scripts/collect-quality-history.mjs`:
     - Cambiar `fetchJson`/`fetchAssetBody` productivos de `withRetry(() => resilientFetch(...))` a `resilientFetch` directo.
     - Mantener `withRetry` para `deps.fetchJson`/`deps.fetchAssetBody` inyectados: `if (baseFetchJson) return withRetry(() => baseFetchJson(path), deps) else return resilientFetch(...)`.
   - `scripts/persist-quality-history.mjs`:
     - `resilientGetTag` y `findAssetResilient`: cuando no hay `deps.request`, usar `resilientFetch` directo; cuando hay `deps.request`, usar `withRetry` sobre `deps.request`.
     - No envolver `resilientFetch` con `withRetry`.
   - `scripts/github-api-request.mjs`: sin cambios funcionales (ya expone `resilientFetch`, `withRetry`, `singleAttemptFetch`).

5. **GREEN**

   - Re-ejecutar las dos pruebas → `calls === 3`.

6. **Verificar definitivos no reintentan**

   - `deps.fetch` con `401` → 1 llamada.

7. **Verificar Retry-After / X-RateLimit-Reset**

   - `429` con `Retry-After: 1` → `sleep` ≈1000 y 2 llamadas.
   - `403` con `x-ratelimit-remaining: 0` y `x-ratelimit-reset` futuro → delay correspondiente.

8. **Verificar POST**

   - `POST` con `deps.request` → 1 llamada.
   - Reconciliación con `GET 404` → segundo POST, total 2.

9. **Suites y regresiones**

   - `for file in scripts/test-*.mjs; do node "$file"; done` → 18+ passes.
   - `node --check`, `git diff --check`.

10. **Diff**

    - `git diff --stat` debe mostrar solo `collect`, `persist` y el nuevo test.

## Verificación final

- `git diff --check` limpio.
- Árbol limpio tras commit.
- Solo tres archivos nuevos/modificados de spec en esta fase (commit documental).
