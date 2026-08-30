# SmartContable

SmartContable es una plataforma SaaS para automatizacion fiscal y contable en Mexico.

## Descripcion

SmartContable facilita la gestion contable de empresas mediante la automatizacion de tareas operativas como:

- Importacion masiva de CFDI.
- Procesamiento de archivos XML y ZIP.
- Generacion automatica de polizas contables.
- Mapeo de cuentas contables por RFC.
- Conciliacion bancaria.
- Gestion multiempresa.
- Reportes e informes contables.

El objetivo es reducir el tiempo operativo del area contable y minimizar errores manuales durante el registro de operaciones.

---

## Arquitectura

### Backend

- FastAPI
- SQLAlchemy
- MySQL
- JWT Authentication
- Pydantic
- Python 3.13+

### Frontend

- React
- Vite
- Tailwind CSS
- Axios
- React Router

### Base de Datos

- MySQL

---

## Funcionalidades Implementadas

### Gestion de Empresas

- Registro de empresas
- Administracion multiempresa
- Asociacion de usuarios por empresa

### Gestion de CFDI

- Carga individual de XML
- Carga masiva de ZIP
- Extraccion automatica de datos fiscales
- Validacion de estructura CFDI

### Polizas Contables

- Generacion automatica de polizas
- Registro de movimientos contables
- Integracion con CFDI procesados

### Mapeo de Cuentas

- Asociacion de RFC con cuentas contables
- Configuracion personalizada por empresa
- Automatizacion de asignacion contable

### Conciliacion Bancaria

- Registro de movimientos bancarios
- Validacion y conciliacion de operaciones

### Reportes

- Informes contables
- Resumenes financieros
- Exportacion de informacion

---

## Estructura del Proyecto

```text
smart-contable/
├── backend/
│   ├── app/
│   │   ├── api/
│   │   ├── core/
│   │   ├── models/
│   │   ├── repositories/
│   │   ├── schemas/
│   │   ├── services/
│   │   ├── tasks/
│   │   └── ai/
│   └── requirements.txt
├── frontend/
│   ├── src/
│   │   ├── components/
│   │   ├── pages/
│   │   ├── services/
│   │   └── utils/
│   └── package.json
└── README.md
```

---

## Instalacion

### Backend

```bash
cd backend
python -m venv venv
# Windows
venv\Scripts\activate
pip install -r requirements.txt
uvicorn app.main:app --reload
```

Variables de entorno minimas:

```env
DATABASE_URL=mysql+pymysql://usuario:password@localhost/smart_contable
SECRET_KEY=your_secret_key
ACCESS_TOKEN_EXPIRE_MINUTES=60
```

### Frontend

```bash
cd frontend
npm install
npm run dev
```

---

## Roadmap

### Ruta beta $0 vigente

Para compartir SmartContable con colegas contadores sin mantener una computadora encendida y sin depender de capacidad disponible en Oracle Cloud, la beta se orienta a:

- Frontend en Vercel Free.
- Backend FastAPI en Amazon EC2 `t3.micro` x86, si la consola la marca elegible para AWS Free Tier.
- Base de datos Amazon RDS for MySQL `db.t3.micro`, si la consola la marca elegible.
- Amazon S3 privado para XML/PDF, pendiente de integración en el backend.
- AWS Budgets, alertas de Free Tier y límites de CloudWatch configurados antes de crear recursos.
- Carga masiva mensual de XML CFDI por lotes.
- Procesamiento de pocos PDF bancarios por carga.
- Persistencia de datos extraidos, estados y errores; XML/PDF originales en S3 cuando la integración esté implementada.

Guia operativa: `docs/PWA_BETA_SIN_CLOUD.md`.

### Proximas Funcionalidades

- Catalogo de cuentas contables
- Reglas automaticas de clasificacion
- Dashboard financiero
- Exportacion a Excel y PDF
- Integracion bancaria avanzada
- Despliegue beta Vercel + AWS Free Tier + RDS for MySQL + S3
- Integracion con Oracle Cloud como alternativa futura si hay capacidad disponible
- Auditoria de movimientos
- Automatizacion inteligente de polizas

---

## Estado del Proyecto

En desarrollo activo.

Actualmente enfocado en:

- Automatizacion contable basada en CFDI.
- Mapeo inteligente de cuentas contables.
- Generacion automatica de polizas.
- Beta PWA gratuita con backend centralizado y base de datos compatible con MySQL.
- Escalabilidad para entorno SaaS multiempresa.

---

## Autor

Eduardo Vazquez

Proyecto desarrollado como plataforma contable moderna para automatizar procesos financieros y fiscales en Mexico.
