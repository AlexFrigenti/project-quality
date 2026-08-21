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

- formato o lint cuando exista una herramienta aplicable;
- comprobación de tipos cuando el lenguaje lo permita;
- build o empaquetado;
- pruebas automatizadas;
- prueba de arranque o smoke test;
- E2E, visuales o integración cuando existan UI, red, almacenamiento o flujos críticos;
- cobertura cuando haya una infraestructura de tests suficientemente madura.

Un comando ausente no debe convertirse en un paso verde falso. Debe implantarse, sustituirse por una validación equivalente o quedar registrado como deuda técnica. En un proyecto estático sin gestor de paquetes puede utilizarse un validador determinista de contratos, pero debe comprobar comportamiento o artefactos reales.

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

- instalación reproducible cuando el proyecto tenga dependencias;
- lint o comprobación equivalente cuando exista una herramienta aplicable;
- build;
- pruebas de lógica y estado;
- smoke de arranque;
- validación de versión y artefactos;
- pruebas visuales o revisión manual controlada para cambios de composición.

No necesita inventar una API, una base de datos o una cobertura de backend que el proyecto no tiene.

### Perfil de preview estática

Adecuado para repositorios experimentales como `Nucleo-preview`, que pueden no tener `package.json` ni un gestor de dependencias.

Controles habituales:

- validador determinista de referencias, recursos, versiones e invariantes relevantes;
- smoke local o del artefacto cuando exista un servidor o paquete verificable;
- comprobación de que los recursos publicados corresponden al estado revisado;
- revisión visual o manual controlada para cambios de composición, animación y experiencia móvil.

Puede consumir `static-quality.yml`. No debe inventar instalación, lint, cobertura o tests de Node que el repositorio no necesita.

### Perfil Worker o aplicación con datos

Añade al perfil web:

- migraciones reproducibles;
- tests de aislamiento por propietario;
- pruebas de contratos de API;
- dobles de bindings o servicios gestionados;
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

Cuando el workflow sea estable, configurar las reglas de `main` para exigir la PR, el quality gate agregado del perfil y los bloqueos de borrado y force push adecuados. La verificación debe aceptar rulesets o branch protection clásica solo cuando el mecanismo aplica a `main`, permite merge commit, no deja bypasses relevantes y expone información suficiente; una respuesta incompleta o errónea se trata como desconocida, no como protección válida. Antes de bloquear, comprobar que los nombres de los checks son estables y que el workflow también funciona para PRs.


## Flujo de desarrollo asistido por IA

Todo cambio se clasifica antes de editar como T0 (trivial), T1 (funcional) o T2 (complejo o sensible), según el diseño operativo de docs/superpowers/specs/2026-08-15-official-ai-development-flow-design.md.

- T0 requiere alcance breve, diff revisado y validación adecuada.
- T1 requiere especificación, plan, tareas, criterios de aceptación y pruebas relacionadas.
- T2 añade decisiones técnicas, riesgos, contratos o invariantes afectados y plan de pruebas ampliado.

El ciclo común es: contexto y exclusiones → especificación → plan → tareas y pruebas → implementación aislada → verificación local → Pull Request → checks y revisión → merge commit confirmado → limpieza de rama. La especificación documenta la intención; el código y las pruebas muestran el comportamiento; GitHub Actions aporta la evidencia. Ningún documento sustituye los gates técnicos ni justifica controles artificiales.

Los artefactos T1/T2 se guardan en specs/NNN-feature-name/ cuando el proyecto adopte ese flujo. research.md, contratos, diagramas y checklists solo se crean cuando aportan información real. En esta primera implantación no se bloquean PRs únicamente por carecer de especificación.
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
