# AGENTS.md

## Proyecto

SmartContable

Plataforma SaaS para automatización fiscal y contable en México.

Objetivo principal: automatizar procesos contables, fiscales y financieros mediante reglas de negocio, integración SAT e inteligencia artificial.

---

# Stack Tecnológico

## Backend

* Python 3.13+
* FastAPI
* SQLAlchemy
* Alembic
* MySQL
* JWT Authentication
* Pytest

## Frontend

* React
* Vite
* Tailwind CSS

## IA

* OpenAI API
* Arquitectura basada en agentes
* Procesamiento de CFDI
* Clasificación automática
* Generación de pólizas
* Inteligencia fiscal

---

# Arquitectura General

Mantener separación estricta de responsabilidades.

```text
Frontend
    ↓
API Layer
    ↓
Service Layer
    ↓
Repository Layer
    ↓
Database Layer
```

Nunca colocar lógica de negocio dentro de endpoints.

Nunca acceder directamente a la base de datos desde endpoints.

---

# Estructura del Proyecto

```text
app/
├── api/
├── core/
├── models/
├── schemas/
├── repositories/
├── services/
├── tasks/
├── ai/
└── main.py
```

## Responsabilidades

### api

Routers y endpoints FastAPI.

### services

Lógica de negocio.

### repositories

Acceso a datos y consultas SQLAlchemy.

### models

Modelos ORM.

### schemas

Modelos Pydantic.

### core

Configuración, seguridad, permisos y dependencias.

### tasks

Procesos asíncronos y trabajos programados.

### ai

Agentes, prompts y servicios de inteligencia artificial.

---

# FastAPI

## Reglas

* Utilizar APIRouter para todos los endpoints.
* Mantener versionado bajo `/api/v1`.
* Utilizar Depends para inyección de dependencias.
* Utilizar Pydantic para validaciones.
* Mantener endpoints delgados.

Los endpoints solo deben:

1. Recibir datos.
2. Validar datos.
3. Llamar servicios.
4. Retornar respuesta.

---

# SQLAlchemy

## Reglas

* Utilizar ORM por defecto.
* Evitar SQL crudo salvo necesidad justificada.
* Definir relaciones explícitas.
* Evitar consultas N+1.
* Mantener integridad referencial.

Toda consulta compleja debe ubicarse en repositories.

---

# Base de Datos

Toda entidad debe incluir:

* created_at
* updated_at

Siempre utilizar migraciones Alembic.

No modificar tablas manualmente.

No modificar estructuras directamente en producción.

---

# Seguridad

Nunca exponer:

* passwords
* secret keys
* JWT tokens
* credenciales SAT
* datos sensibles de clientes

Utilizar variables de entorno para configuraciones sensibles.

Toda autenticación debe usar JWT.

---

# Multiempresa

SmartContable es una plataforma SaaS multiempresa.

Toda entidad de negocio debe considerar:

* empresa_id
* aislamiento de datos
* validación de acceso

Nunca retornar información de otra empresa.

---

# CFDI y SAT

Mantener compatibilidad con CFDI 4.0.

Reglas:

* Validar XML antes de procesar.
* Conservar UUID como identificador fiscal principal.
* No asumir estructuras rígidas.
* Manejar cancelaciones y sustituciones.
* Registrar errores de procesamiento.

---

# Inteligencia Artificial

Toda integración IA debe ubicarse dentro de:

```text
app/ai/
```

Estructura sugerida:

```text
ai/
├── agents/
├── prompts/
├── services/
├── tools/
└── embeddings/
```

## Reglas

* No mezclar lógica IA con endpoints.
* Mantener prompts desacoplados del código.
* Guardar prompts como archivos independientes.
* Mantener trazabilidad de respuestas generadas.

---

# Testing

Toda funcionalidad crítica debe incluir pruebas.

Prioridad:

1. Services
2. Repositories
3. Endpoints

Utilizar pytest.

No aprobar cambios que rompan pruebas existentes.

---

# Calidad de Código

## Principios

* SOLID
* DRY
* Clean Code

## Reglas

* Crear servicios reutilizables.
* Evitar duplicación de código.
* Mantener funciones pequeñas.
* Mantener nombres descriptivos.

---

# Convenciones Python

* PEP8
* type hints cuando sea posible
* nombres descriptivos
* documentación en funciones complejas

---

# Convenciones React

* PascalCase para componentes
* camelCase para variables
* componentes pequeños y reutilizables
* evitar lógica compleja dentro de JSX
* consumir API mediante capa services

---

# Roadmap Prioritario

1. Dockerización
2. Testing automatizado
3. Multiempresa
4. Integración SAT
5. SmartContable AI
6. Conciliación automática avanzada
7. Reportes financieros inteligentes

---

# Objetivo Final

Convertir SmartContable en una plataforma SaaS de inteligencia fiscal para PyMEs y despachos contables de México, capaz de automatizar procesos contables, fiscales y financieros mediante reglas de negocio e inteligencia artificial.
