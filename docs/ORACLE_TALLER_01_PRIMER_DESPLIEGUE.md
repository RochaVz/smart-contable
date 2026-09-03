# Taller 01: primer despliegue Oracle Cloud para SmartContable

Duracion estimada: 60 a 90 minutos.
Perfil: persona sin experiencia previa en Oracle Cloud.
Objetivo: terminar con access points reales cargados en la plantilla oficial.

## Resultado esperado del taller

Al finalizar, debes tener completado:

- docs/ORACLE_ENDPOINTS_ACCESOS_BETA.md

Y validado:

- URL frontend funcionando.
- URL health del backend funcionando.
- Acceso SSH funcionando.

## Material que vas a usar

1. docs/ORACLE_CLOUD_SETUP_PASO_A_PASO.md
2. docs/ORACLE_ENDPOINTS_ACCESOS_BETA.md
3. backend/.env.oracle.example
4. frontend/.env.oracle.example

## Agenda del taller

1. Crear o revisar VM en Oracle Cloud.
2. Identificar IP publica y probar SSH.
3. Definir dominio/subdominio para API.
4. Configurar URL del frontend.
5. Completar plantilla de access points.
6. Hacer pruebas de conectividad.

## Paso 1. Confirmar VM e IP publica

En Oracle Cloud:

- Ir a Compute > Instances.
- Abrir la instancia smartcontable-api-beta.
- Copiar Public IP.

Guarda ese valor en una nota temporal como:

- ORACLE_PUBLIC_IP=AAA.BBB.CCC.DDD

## Paso 2. Probar acceso SSH

En PowerShell:

```powershell
ssh -i $env:USERPROFILE\.ssh\smartcontable_oracle opc@AAA.BBB.CCC.DDD
```

Si entras, marca el paso como listo.
Si falla, revisar:

- Security List/NSG con puerto 22.
- Ruta de la clave privada.
- Usuario opc.

## Paso 3. Definir API base

Regla simple:

- Si tienes dominio propio: usar https://api.tudominio.com/api/v1
- Si no tienes dominio propio hoy: usar temporalmente IP publica + TLS cuando este lista la capa HTTPS.

Importante:

- No apuntar frontend publicado a http sin TLS para datos fiscales.

## Paso 4. Configurar frontend

En Vercel, agregar variable:

- VITE_API_URL=https://api.tudominio.com/api/v1

Redeploy del frontend despues de cambiar la variable.

## Paso 5. Completar plantilla oficial

Abrir docs/ORACLE_ENDPOINTS_ACCESOS_BETA.md y llenar:

- Frontend beta
- API base
- Health check
- API docs
- SSH admin

Cambiar el estado de Pendiente a Activo en cada fila que ya funcione.

## Paso 6. Pruebas finales

Desde tu equipo:

```bash
curl -I https://TU_FRONTEND
curl -I https://TU_API_BASE_SIN_API_V1/health
```

Desde celular en red movil:

- Abrir frontend.
- Iniciar sesion.
- Consultar una pantalla con datos.

## Criterio de exito

Se considera exitoso si:

1. Puedes entrar por SSH sin errores.
2. Frontend carga desde internet.
3. Health responde.
4. Plantilla de access points esta completa y versionada.

## Lecciones aprendidas (llenar al cerrar el taller)

- Que fue facil:
- Que fue dificil:
- Que documentacion faltaba:
- Cuanto tiempo total tomo:
- Cambios recomendados para el Taller 02:
