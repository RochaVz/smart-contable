# Smart Contable

Sistema contable inteligente para la automatización de procesos contables mediante la importación y procesamiento de CFDI (XML) en México.

## Descripción

Smart Contable es una plataforma desarrollada para facilitar la gestión contable de empresas mediante la automatización de tareas repetitivas como:

* Importación masiva de CFDI.
* Procesamiento de archivos XML y ZIP.
* Generación automática de pólizas contables.
* Mapeo de cuentas contables por RFC.
* Conciliación bancaria.
* Gestión multiempresa.
* Reportes e informes contables.

El objetivo es reducir el tiempo operativo del área contable y minimizar errores manuales durante el registro de operaciones.

---

## Arquitectura

### Backend

* FastAPI
* SQLAlchemy
* MySQL
* JWT Authentication
* Pydantic
* Python 3.11+

### Frontend

* React
* TypeScript
* Axios
* React Router

### Base de Datos

* MySQL
* Administración mediante MySQL Workbench

---

## Funcionalidades Implementadas

### Gestión de Empresas

* Registro de empresas
* Administración multiempresa
* Asociación de usuarios por empresa

### Gestión de CFDI

* Carga individual de XML
* Carga masiva de ZIP
* Extracción automática de datos fiscales
* Validación de estructura CFDI

### Pólizas Contables

* Generación automática de pólizas
* Registro de movimientos contables
* Integración con CFDI procesados

### Mapeo de Cuentas

* Asociación de RFC con cuentas contables
* Configuración personalizada por empresa
* Automatización de asignación contable

### Conciliación Bancaria

* Registro de movimientos bancarios
* Validación y conciliación de operaciones

### Reportes

* Informes contables
* Resúmenes financieros
* Exportación de información

---

## Estructura del Proyecto

```text
smart-contable/

├── backend/
│   ├── app/
│   │   ├── api/
│   │   ├── models/
│   │   ├── schemas/
│   │   ├── services/
│   │   ├── core/
│   │   └── database/
│   └── requirements.txt
│
├── frontend/
│   ├── src/
│   │   ├── pages/
│   │   ├── components/
│   │   ├── services/
│   │   └── routes/
│   └── package.json
│
└── README.md
```

---

## Instalación

### Backend

```bash
cd backend

python -m venv venv

# Windows
venv\Scripts\activate

pip install -r requirements.txt
```

Configurar variables de entorno:

```env
DATABASE_URL=mysql+pymysql://usuario:password@localhost/smart_contable

SECRET_KEY=your_secret_key

ACCESS_TOKEN_EXPIRE_MINUTES=60
```

Ejecutar servidor:

```bash
uvicorn app.main:app --reload
```

---

### Frontend

```bash
cd frontend

npm install

npm run dev
```

---

## Roadmap

### Próximas Funcionalidades

* Catálogo de cuentas contables
* Reglas automáticas de clasificación
* Dashboard financiero
* Exportación a Excel y PDF
* Integración bancaria avanzada
* Auditoría de movimientos
* Automatización inteligente de pólizas

---

## Estado del Proyecto

En desarrollo activo.

Actualmente enfocado en:

* Automatización contable basada en CFDI.
* Mapeo inteligente de cuentas contables.
* Generación automática de pólizas.
* Escalabilidad para entorno SaaS multiempresa.

---

## Autor

**Eduardo Vázquez**

Proyecto desarrollado como plataforma contable moderna para automatizar procesos financieros y fiscales en México.
