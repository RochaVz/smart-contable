# Plantilla oficial de endpoints y accesos (beta Oracle Cloud)

Completa este documento una sola vez y mantenlo actualizado.
Este archivo es la fuente oficial para todo el equipo.

## 1. Access points principales

| Componente | Access point | Estado | Nota |
|---|---|---|---|
| Frontend beta | https://PENDIENTE.vercel.app | Pendiente | URL publica de Vercel |
| API base | https://api.PENDIENTE.com/api/v1 | Pendiente | Base URL para frontend |
| Health check | https://api.PENDIENTE.com/health | Pendiente | Verificacion de vida del backend |
| API docs (solo beta privada) | https://api.PENDIENTE.com/docs | Pendiente | Desactivar o proteger en produccion final |
| SSH admin | ssh -i ~/.ssh/smartcontable_oracle opc@PENDIENTE_IP | Pendiente | Solo administradores |

## 2. Endpoints de negocio minimos a validar

| Flujo | Endpoint | Metodo | Resultado esperado |
|---|---|---|---|
| Login | /api/v1/auth/login | POST | Token JWT valido |
| Empresas | /api/v1/empresas | GET | Solo empresas del usuario |
| CFDI upload | /api/v1/facturas/upload | POST | XML/ZIP procesados |
| Conciliacion PDF | /api/v1/conciliacion/estado-cuenta | POST | Movimientos parseados |
| Reportes | /api/v1/reportes/* | GET | Datos por periodo/empresa |

## 3. Variables de entorno productivas

### Backend (Oracle VM)

```env
DATABASE_URL=mysql+pymysql://USUARIO:PASSWORD@127.0.0.1:3306/smart_contable
SECRET_KEY=PENDIENTE_MIN_32_CARACTERES
ALGORITHM=HS256
ACCESS_TOKEN_EXPIRE_MINUTES=480
ENVIRONMENT=production
DEBUG=false
CORS_ORIGINS=https://PENDIENTE.vercel.app
```

### Frontend (Vercel)

```env
VITE_API_URL=https://api.PENDIENTE.com/api/v1
```

## 4. Red y seguridad

| Recurso | Valor objetivo | Estado |
|---|---|---|
| Puerto 22 | Abierto solo a IP admin | Pendiente |
| Puerto 80 | Abierto (redirect HTTPS) | Pendiente |
| Puerto 443 | Abierto | Pendiente |
| Puerto 3306 | Cerrado a internet publica | Pendiente |
| Puerto 8000 | Cerrado a internet publica | Pendiente |

## 5. Operacion diaria

- Confirmar /health al inicio de cada jornada.
- Revisar errores de login, carga XML y carga PDF.
- Ejecutar backup MySQL diario.
- Probar restauracion semanal en entorno de prueba.

## 6. Control de cambios

| Fecha | Cambio | Responsable |
|---|---|---|
| PENDIENTE | Creacion inicial de endpoints/accesos | PENDIENTE |

## 7. Llenado guiado (muy didactico)

Si nunca has usado Oracle Cloud, llena la plantilla en este orden:

1. Frontend beta
	- De donde sale: panel de Vercel, campo "Production URL".
	- Ejemplo: https://smartcontable-beta.vercel.app
	- Pegalo en la fila "Frontend beta".
2. SSH admin
	- De donde sale: Oracle Cloud > Compute > Instances > tu instancia > Public IP.
	- Con ese dato completas: ssh -i ~/.ssh/smartcontable_oracle opc@TU_IP_PUBLICA
	- Pegalo en la fila "SSH admin".
3. API base
	- De donde sale: subdominio DNS que apuntes a la IP publica de Oracle VM.
	- Formato final: https://api.tudominio.com/api/v1
	- Pegalo en la fila "API base".
4. Health check
	- Se arma con la misma base del API.
	- Formato: https://api.tudominio.com/health
	- Pegalo en la fila "Health check".
5. API docs
	- Se arma con la misma base del API.
	- Formato: https://api.tudominio.com/docs
	- Pegalo en la fila "API docs".

## 8. Verificacion rapida de accesos

Despues de completar los access points, valida estos 3 puntos:

1. Frontend abre bien

```bash
curl -I https://TU_FRONTEND_URL
```

Respuesta esperada: codigo 200 o 301/302.

2. API de salud responde

```bash
curl -I https://TU_API_BASE_SIN_/api/v1/health
```

Si tu API base ya es https://api.tudominio.com/api/v1, el health correcto normalmente sera:

```bash
curl -I https://api.tudominio.com/health
```

3. CORS permite tu frontend

- Revisa `CORS_ORIGINS` en backend.
- Debe incluir exactamente el dominio final de Vercel.
- No debe incluir `*` en beta con datos fiscales.

## 9. Convencion de nombres recomendada

Para evitar confusiones en equipo, usar siempre:

- Frontend: `smartcontable-beta`.
- API: `api.smartcontable-beta`.
- VM: `smartcontable-api-beta`.
- Base de datos: `smart_contable`.

Con esta convencion, cualquier integrante entiende rapido donde esta cada cosa.
