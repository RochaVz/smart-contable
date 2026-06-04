# AGENTS.md

## Proyecto

SmartContable

Plataforma SaaS para automatización fiscal y contable en México.

---

## Stack Tecnológico

### Backend

- Python
- FastAPI
- SQLAlchemy
- Alembic
- MySQL
- JWT Authentication

### Frontend

- React
- Vite
- Tailwind CSS

---

## Objetivos del Proyecto

Automatizar:

- Procesamiento CFDI
- Generación de pólizas
- Conciliación bancaria
- Reportes financieros
- Inteligencia fiscal

---

## Reglas para los Agentes IA

### Arquitectura

Mantener separación estricta:

- API Layer
- Services Layer
- Repository Layer
- Database Layer

Nunca colocar lógica de negocio en endpoints.

---

### Base de Datos

Toda entidad debe incluir:

- created_at
- updated_at

Usar migraciones Alembic.

No modificar tablas manualmente.

---

### Backend

Seguir principios SOLID.

Crear servicios reutilizables.

Evitar duplicación de código.

---

### Frontend

Mantener componentes pequeños.

Evitar lógica compleja dentro de JSX.

Consumir API mediante capa services.

---

### Seguridad

Nunca exponer:

- passwords
- secrets
- tokens
- credenciales SAT

Usar variables de entorno.

---

## Convenciones

### Python

PEP8

### React

PascalCase para componentes.

camelCase para variables.

---

## Roadmap Prioritario

1. Dockerización
2. Testing
3. Multiempresa
4. Integración SAT
5. Conciliación automática
6. SmartContable AI

---

## Objetivo Final

Convertir SmartContable en una plataforma SaaS de inteligencia fiscal para PyMEs y despachos contables.