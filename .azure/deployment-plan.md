# SmartContable Azure Deployment Plan

## Status

**Approved by user with `VAMOS CON TODO`.** Provider decision closed: Azure. Database Option A (embedded SQLite) confirmed. Local, reversible preparation work has been executed (see Execution Log below). Resource provisioning is still pending Azure subscription/region confirmation from the user before any `azd`/`az` command is run.

## Scope

Evaluate deployment options for the existing SmartContable React/Vite frontend and FastAPI/MySQL backend. Do not provision resources, create IaC, add Dockerfiles, or change runtime configuration until the user explicitly authorizes execution with the phrase `VAMOS CON TODO`.

## Current Recommendation

**Final decision (approved):** Azure, feedback pilot phase (see `docs/ROADMAP_DESPLIEGUE.md` section 0.1). Owner + a small group of accountant colleagues will test the app on mobile and laptop browsers via a shared cloud URL, with PWA install support. No native app packaging and no per-device local database for this phase. Database Option A (embedded SQLite) confirmed over GCP/Oracle alternatives.

## Candidate Azure Architecture

- Frontend: Azure Static Web Apps, Free plan, PWA-enabled for "Add to Home Screen" on mobile.
- API: Azure Container Apps (consumption) or a low-cost App Service Linux plan, selected after local container and cost validation.
- Database: no managed MySQL for this phase — confirmed $0 budget. Choose between Option A (embedded SQLite on the same Azure free compute) or Option C (self-managed MySQL on an Oracle Cloud Always Free VM, alongside the frontend/backend or all-in-one). See `docs/ROADMAP_DESPLIEGUE.md` section 0.3. Default recommendation is Option A pending final user confirmation.
- Secrets: Azure Key Vault or platform-managed secret references.
- Monitoring: Application Insights/Azure Monitor at the minimum viable level, so issues reported by pilot testers can be traced centrally.
- Files: object storage only if CFDI/PDF retention is separated from relational data.

## Confirmed Pilot Parameters

1. Users: approximately 10 accountant colleagues initially.
2. Signup: self-service, each colleague creates their own login via existing auth.
3. Desired pilot name: `smartcontable-beta` (subject to subdomain availability; App Service allows a custom `.azurewebsites.net` name if available, Static Web Apps defaults to a randomized hostname).
4. Duration: 6-month pilot end date.
5. Budget: $0 confirmed. No paid managed database for this phase; see database alternatives above (Option A default, Option C as zero-cost fallback).
6. Pending decision: keep this cloud pilot (Options A/B/C) for centralized feedback from colleagues now, vs. moving to a fully local "install per device + manual backup/restore" model (Alternative D in `docs/ROADMAP_DESPLIEGUE.md` section 0.4), which trades away centralized error visibility. This is an architecture-level decision awaiting user confirmation before any provisioning.
7. Core-engine constraint (confirmed): the CFDI/XML/PDF processing engine is the heart of the app and must not be rewritten in JavaScript to satisfy mobile local install. It stays centralized in Python, server-side. Alternative D is therefore constrained to laptop-only for now; mobile remains a thin client against the centralized engine. See `docs/ROADMAP_DESPLIEGUE.md` section 0.5.

## Execution Log (local, reversible changes only — no Azure resources created yet)

1. `backend/app/core/database.py` — engine now builds SQLite-safe args (`connect_args={"check_same_thread": False}`) instead of MySQL-only QueuePool args (`pool_size`/`max_overflow`) when `DATABASE_URL` starts with `sqlite`.
2. `backend/.env.example` — documents the SQLite pilot `DATABASE_URL` and the future MySQL production one, plus `CORS_ORIGINS` placeholder.
3. `backend/.gitignore` — excludes the SQLite data file/folder and un-ignores `.env.example`.
4. `backend/Dockerfile` + `backend/.dockerignore` — reproducible container image for the API (Linux, includes lxml/pymupdf system deps).
5. `frontend/public/manifest.webmanifest` + `frontend/public/sw.js` + `index.html`/`main.jsx` — installable PWA ("Add to Home Screen") with a no-cache service worker so mobile/laptop browsers can install the app without an app store.
6. Validated: `pytest` (50 passed, 3 pre-existing failures unrelated to this change — missing local `OPENAI_API_KEY`), `npm run build` (frontend build succeeds, manifest/service worker present in `dist/`).

## Required Gates Before Execution

1. Unit and integration test baseline.
2. Predeployment checks and CI pipeline.
3. Responsive/mobile browser validation.
4. Backup and restore rehearsal.
5. Cost model and budget alert approval.
6. Security review of JWT, CORS, uploads, secrets, and tenant isolation.
7. Explicit user approval using `VAMOS CON TODO`.
