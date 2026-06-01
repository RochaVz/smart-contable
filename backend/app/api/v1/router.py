from fastapi import APIRouter
from app.api.v1.endpoints import (
    auth,
    conciliacion,
    configuracion,
    empresas,
    facturas,
    polizas,
    reportes
)

api_router = APIRouter()

# Al agregar prefix, ya no necesitas escribir "/auth" dentro de cada archivo de endpoint
# Al agregar tags, Swagger agrupa los endpoints por categorías
api_router.include_router(auth.router, prefix="/auth", tags=["Autenticación"])
api_router.include_router(conciliacion.router, prefix="/conciliacion", tags=["Conciliación bancaria"])
api_router.include_router(configuracion.router, prefix="/configuracion", tags=["Configuración"])
api_router.include_router(empresas.router, prefix="/empresas", tags=["Empresas"])
api_router.include_router(facturas.router, prefix="/facturas", tags=["Facturas"])
api_router.include_router(polizas.router, prefix="/polizas", tags=["Pólizas"])
api_router.include_router(reportes.router, prefix="/reportes", tags=["Reportes Financieros"])
