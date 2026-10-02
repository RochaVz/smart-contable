# Arquitectura SmartContable

> Documento breve de orientación.
>
> **Fuente canónica detallada (esqueleto para nuevos proyectos):**
> [ARQUITECTURA_DETALLADA_ESQUELETO.md](ARQUITECTURA_DETALLADA_ESQUELETO.md)
>
> **Estado técnico consolidado 2026-10-01:**
> [REPORTE_TECNICO_DETALLADO_2026-10-01_ESQUELETO_PLATAFORMA.md](../REPORTE_TECNICO_DETALLADO_2026-10-01_ESQUELETO_PLATAFORMA.md)

## Visión General

SmartContable utiliza una arquitectura cliente-servidor multiempresa, con frontend PWA y backend FastAPI versionado.

```text
React Frontend (Vite + PWA)
      │  HTTPS + JWT
      ▼
FastAPI Backend (/api/v1)
      │
      ▼
Services (dominio)
      │
      ▼
SQLAlchemy + Alembic
      │
      ▼
MySQL (local / RDS)
```

## Capas

1. **Frontend** — UI, navegación, cliente HTTP, PWA.
2. **API** — routers FastAPI delgados bajo `/api/v1`.
3. **Services** — reglas de negocio y orquestación.
4. **Models/ORM** — persistencia SQLAlchemy.
5. **MySQL** — fuente de verdad relacional (Alembic en prod).

## Principios

- No poner lógica de negocio en endpoints ni en JSX denso.
- Multiempresa con `empresa_id` y validación de acceso.
- Schema solo por migraciones Alembic.
- Secretos fuera del repositorio.
- Health: `GET /health`, Ready: `GET /ready`.

## Despliegue beta de referencia

- Frontend: Vercel
- Backend: AWS EC2 + Docker Compose + Caddy
- DB: Amazon RDS MySQL
- Archivos: S3 opcional

Para diagramas C4, bounded contexts, guía de clonación y deudas conocidas, usar el documento canónico de arquitectura detallada.
