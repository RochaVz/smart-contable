# Oracle Cloud para SmartContable (paso a paso, desde cero)

Esta guia esta hecha para alguien que nunca ha usado Oracle Cloud.
Objetivo: dejar una beta funcional con backend FastAPI y MySQL en Oracle Cloud Always Free, y frontend publicado en Vercel.

Si prefieres seguirlo como clase practica, usa tambien:

- docs/ORACLE_TALLER_01_PRIMER_DESPLIEGUE.md

## 1. Que vas a tener al final

Arquitectura final (simple):

- Frontend PWA en Vercel.
- Backend FastAPI en una VM de Oracle Cloud.
- MySQL autoadministrado en la misma VM (o en VM separada en fase 2).
- Endpoints/accesos documentados en una plantilla unica.

## 2. Conceptos basicos (en lenguaje simple)

- Tenancy: tu "cuenta principal" de Oracle Cloud.
- Compartment: una carpeta para organizar recursos (ejemplo: smartcontable-beta).
- VCN: red virtual privada.
- Subnet: segmento de esa red.
- NSG / Security List: reglas de firewall.
- Public IP: direccion visible desde internet.

## 3. Checklist rapido antes de empezar

- Cuenta Oracle Cloud activada.
- Correo y telefono verificados.
- Llave SSH creada en tu laptop.
- Repositorio listo con backend y frontend.

Comando para generar llave SSH en Windows PowerShell:

```powershell
ssh-keygen -t ed25519 -C "smartcontable-oracle" -f $env:USERPROFILE\.ssh\smartcontable_oracle
```

Se generan dos archivos:

- Clave privada: ~/.ssh/smartcontable_oracle
- Clave publica: ~/.ssh/smartcontable_oracle.pub

## 4. Crear recursos en Oracle Cloud (consola web)

### 4.1 Crear Compartment

1. Ir a Identity & Security > Compartments.
2. Crear compartment: smartcontable-beta.
3. Descripcion sugerida: Recursos beta SmartContable.

### 4.2 Crear red (VCN)

1. Ir a Networking > Virtual cloud networks.
2. Elegir "VCN Wizard" con internet connectivity.
3. Crear VCN y una subnet publica.
4. Guardar nombre de VCN y subnet en tu plantilla de endpoints.

### 4.3 Crear VM Always Free

1. Ir a Compute > Instances > Create instance.
2. Nombre: smartcontable-api-beta.
3. Imagen: Ubuntu 22.04.
4. Shape recomendado: VM.Standard.A1.Flex (Always Free), 2 OCPU / 12 GB si esta disponible.
5. Red: la VCN/subnet del paso 4.2.
6. Security: marcar asignacion de Public IPv4.
7. Pegar tu clave publica SSH.
8. Crear instancia.

## 5. Abrir puertos correctos (solo los necesarios)

En NSG o Security List abre:

- 22/tcp para SSH (idealmente restringido a tu IP).
- 80/tcp para redireccion HTTP a HTTPS.
- 443/tcp para HTTPS.

No expongas 3306 a internet.
No expongas 8000 a internet en produccion beta.

## 6. Conectarte a la VM

Desde PowerShell:

```powershell
ssh -i $env:USERPROFILE\.ssh\smartcontable_oracle opc@TU_PUBLIC_IP
```

Si no entra:

- Revisar que el usuario sea opc.
- Revisar que puerto 22 este abierto.
- Revisar que usaste la clave privada correcta.

## 7. Instalar runtime en la VM

Dentro de la VM:

```bash
sudo apt update && sudo apt upgrade -y
sudo apt install -y git curl ca-certificates gnupg
```

Instalar Docker + Compose plugin:

```bash
curl -fsSL https://get.docker.com | sudo sh
sudo usermod -aG docker $USER
newgrp docker
docker --version
docker compose version
```

## 8. Desplegar backend + MySQL (version simple)

Opcion didactica recomendada para beta:

- MySQL y FastAPI en la misma VM con Docker Compose.
- FastAPI no expuesto directo.
- Proxy inverso publica solo HTTPS.

Variables minimas backend:

- DATABASE_URL
- SECRET_KEY
- CORS_ORIGINS
- ENVIRONMENT=production
- DEBUG=false

Usa como base el archivo backend/.env.oracle.example.

## 9. Configurar HTTPS y dominio del API

Recomendacion:

- Crear subdominio para API (ejemplo: api.smartcontable-beta.tudominio.com).
- Apuntar DNS al Public IP de Oracle VM.
- Configurar proxy inverso con certificado TLS.

Resultado esperado:

- API base: https://api.smartcontable-beta.tudominio.com/api/v1
- Health: https://api.smartcontable-beta.tudominio.com/health

## 10. Configurar frontend para apuntar al backend Oracle

En Vercel, variable:

- VITE_API_URL=https://api.smartcontable-beta.tudominio.com/api/v1

Publicar y validar:

- Login
- Dashboard
- Carga XML/ZIP
- Carga PDF estado de cuenta
- Exportaciones

## 11. Endpoints vs Access Points (explicacion clara)

- Endpoint: ruta especifica dentro de la API.
  - Ejemplo: /api/v1/auth/login
- Access point: punto de entrada de un componente.
  - Ejemplo: URL del frontend, URL base del API, acceso SSH.

Piensalo asi:

- Access point = "puerta principal".
- Endpoint = "oficina especifica adentro del edificio".

## 12. Dejar "listos" los accesos (plantilla oficial)

Completa este archivo despues de aprovisionar:

- docs/ORACLE_ENDPOINTS_ACCESOS_BETA.md

Ese documento queda como fuente unica de verdad para:

- frontend URL
- API base URL
- health URL
- SSH
- DNS
- CORS permitidos

## 13. Validacion final (checklist operativa)

1. Frontend abre en celular y laptop.
2. Login funciona con usuarios reales de prueba.
3. CORS solo permite dominios reales del frontend.
4. API responde /health en menos de 1s promedio en pruebas ligeras.
5. Carga de XML/ZIP/PDF funciona sin timeout en archivos de prueba.
6. Backup MySQL ejecutado y restauracion probada.
7. Puerto 3306 no expuesto publicamente.
8. SECRET_KEY de 32+ caracteres y no subida a Git.

## 14. Problemas comunes y solucion rapida

- Error CORS en navegador:
  - Revisar CORS_ORIGINS en backend.
  - Revisar que VITE_API_URL use https y dominio correcto.
- Login funciona local pero no en beta:
  - Revisar variable VITE_API_URL en Vercel.
  - Verificar que el backend este levantado y SSL valido.
- No conecta por SSH:
  - Revisar IP publica de la VM.
  - Revisar regla de puerto 22.
  - Revisar ruta de clave privada.
- MySQL intermitente:
  - Revisar memoria disponible de VM.
  - Ajustar limites de contenedores y reinicio automatico.

## 15. Recomendacion para compartir aprendizajes

Agrega al final de cada iteracion una seccion "Lecciones aprendidas" con:

- Que salio bien.
- Que fallo.
- Que cambiarias antes de la siguiente iteracion.
- Tiempos reales de configuracion.

Asi este proyecto sirve tambien como guia practica para otras personas.
