# Contrato común de calidad

## Objetivo

Aplicar un proceso de desarrollo consistente a todos los proyectos sin confundir calidad con una arquitectura única.

El estándar exige que cada cambio sea trazable, comprobable y reversible. Los controles se adaptan al tipo de proyecto, pero nunca se omiten silenciosamente.

## Reglas universales

### 1. Trabajo aislado

- `main` es una rama estable.
- Cada cambio se realiza en una rama específica.
- El alcance de la rama debe corresponder a un sprint, incidencia o mejora concreta.
- No se mezclan refactorizaciones ajenas con una funcionalidad.
- No se hace merge ni despliegue sin revisión y confirmación cuando el flujo del proyecto lo requiera.

### 2. Pull Request obligatoria

Una Pull Request debe explicar:

- qué cambia;
- por qué cambia;
- qué queda fuera;
- cómo se ha validado;
- qué riesgos o limitaciones permanecen.

La PR no se considera lista si los checks obligatorios están fallando o no existe una explicación para una validación no aplicable.

### 3. Validaciones automáticas

Cada proyecto debe tener, como mínimo, los controles que correspondan a su perfil:

- formato o lint;
- comprobación de tipos cuando el lenguaje lo permita;
- build o empaquetado;
- pruebas automatizadas;
- prueba de arranque o smoke test;
- E2E, visuales o integración cuando existan UI, red, almacenamiento o flujos críticos;
- cobertura cuando haya una infraestructura de tests suficientemente madura.

Un comando ausente no debe convertirse en un paso verde falso. Debe implantarse, sustituirse por una validación equivalente o quedar registrado como deuda técnica.

### 4. Tests deterministas

- Preferir funciones puras y contratos pequeños.
- Usar datos sintéticos y reproducibles.
- No depender de secretos, datos personales, facturas reales, cuentas reales o servicios externos en las pruebas normales.
- Aislar red, bases de datos, almacenamiento y reloj cuando el test no esté diseñado específicamente para comprobar esa integración.
- Cada bug reproducible debe incorporar una prueba cuando sea razonable.

### 5. Cobertura

La cobertura sirve para localizar zonas sin verificar, no para fabricar tests de relleno.

Cada proyecto debe:

- medir una línea base;
- fijar umbrales razonables para su estado real;
- evitar que una nueva rama reduzca la cobertura sin justificación;
- ampliar primero el núcleo de lógica y los flujos críticos;
- no copiar porcentajes de otro proyecto sin comprobar que son comparables.

### 6. Seguridad y datos

Nunca se versionan:

- claves API;
- tokens;
- contraseñas;
- credenciales de despliegue;
- datos personales;
- documentos reales;
- bases de datos de producción;
- configuraciones privadas del hosting.

Los ejemplos deben utilizar valores neutros y claramente ficticios. Las integraciones sensibles se prueban con dobles controlados o entornos de prueba.

### 7. Documentación

Cada proyecto debe mantener, según su tamaño:

- README para ejecutar y entender el proyecto;
- contexto técnico y decisiones importantes;
- changelog;
- limitaciones conocidas;
- instrucciones de validación y despliegue.

La documentación debe actualizarse en la misma PR cuando el cambio altere el comportamiento, la arquitectura, los riesgos o el procedimiento operativo.

## Perfiles de proyecto

### Perfil Node/web

Adecuado para aplicaciones como `gestor-autonomo` o Nexo.

Controles habituales:

- instalación reproducible;
- lint;
- TypeScript;
- build;
- pruebas unitarias;
- cobertura;
- E2E de navegación y flujos críticos;
- smoke del artefacto generado;
- comprobación de responsive o exportaciones cuando proceda.

### Perfil juego web o aplicación estática

Adecuado para Núcleo.

Controles habituales:

- instalación reproducible;
- lint o comprobación equivalente;
- build;
- pruebas de lógica y estado;
- smoke de arranque;
- validación de versión y artefactos;
- pruebas visuales o revisión manual controlada para cambios de composición.

No necesita inventar una API, una base de datos o una cobertura de backend que el proyecto no tiene.

### Perfil Worker o aplicación con datos

Añade al perfil web:

- migraciones reproducibles;
- tests de aislamiento por propietario;
- pruebas de contratos de API;
- dobles de D1, R2 u otros bindings;
- integración aislada sobre una base temporal cuando aporte valor;
- controles de compatibilidad del artefacto desplegable.

## Estrategia para proyectos existentes

No se activa todo de golpe.

### Fase A: inventario

Registrar:

- lenguaje y runtime;
- comandos existentes;
- build actual;
- pruebas existentes;
- dependencias críticas;
- artefacto generado;
- riesgos conocidos;
- ausencia de controles.

### Fase B: línea base

Ejecutar los controles disponibles y documentar la deuda actual. La línea base no debe ocultar errores: debe distinguir entre controles nuevos, fallos preexistentes y problemas introducidos por la rama.

### Fase C: endurecimiento

Añadir progresivamente:

1. instalación reproducible;
2. lint o formato;
3. tipos;
4. build;
5. tests deterministas;
6. cobertura;
7. E2E, integración y smoke;
8. seguridad y mantenimiento de dependencias.

### Fase D: bloqueo

Cuando el workflow sea estable, configurar las reglas de `main` para exigir la PR y los checks adecuados. Antes de bloquear, comprobar que los nombres de los checks son estables y que el workflow también funciona para PRs.

## Definition of Done

Un cambio está listo cuando:

- permanece dentro del alcance aprobado;
- no introduce datos ni secretos;
- incluye tests o una justificación clara;
- las validaciones obligatorias pasan;
- la cobertura no empeora sin explicación;
- la documentación relevante está actualizada;
- la PR describe riesgos, limitaciones y forma de validación;
- no requiere un merge o despliegue implícito.

## Fuera de alcance del estándar

Este repositorio no decide:

- reglas fiscales;
- diseño visual concreto;
- arquitectura de cada aplicación;
- proveedores externos;
- estructura de datos de un proyecto;
- estrategia de despliegue específica;
- umbrales universales idénticos para todos los repositorios.

Esas decisiones pertenecen al proyecto consumidor y deben documentarse allí.
