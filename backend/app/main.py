from fastapi import FastAPI, Depends, HTTPException, Request
from fastapi.responses import JSONResponse
from contextlib import asynccontextmanager
from sqlalchemy.orm import Session
from sqlalchemy.exc import IntegrityError, SQLAlchemyError
from fastapi.middleware.cors import CORSMiddleware
from app.core.database import engine, Base, get_db
from app.core.config import settings
from app.core.logging_config import get_logger
from app.core.exceptions import SmartContableException
from app.api.v1.router import api_router
from typing import Optional

# Importamos los modelos explícitamente para que SQLAlchemy los registre
from app.models.usuario import Usuario  # noqa: F401
from app.models.empresa import Empresa  # noqa: F401
from app.models.factura import Factura  # noqa: F401
from app.models.poliza import Poliza, MovimientoPoliza # noqa: F401 
from app.models.mapeo_cuenta import MapeoCuenta # noqa: F401
from app.models.comision_banco import ComisionBanco # noqa: F401
from app.models.conciliacion import EstadoCuentaCarga, MovimientoBanco # noqa: F401

logger = get_logger(__name__)


def _is_origin_allowed(origin: Optional[str]) -> bool:
    if not origin:
        return False
    if origin in settings.CORS_ORIGINS:
        return True
    import re
    if re.match(r"^https?://(localhost|127\.0\.0\.1)(:\d+)?$", origin):
        return True
    return False


def _cors_headers(request: Request) -> dict:
    """Return CORS headers when the origin is in the allowed list."""
    origin: Optional[str] = request.headers.get("origin")
    if _is_origin_allowed(origin):
        return {
            "Access-Control-Allow-Origin": origin,
            "Access-Control-Allow-Credentials": "true",
        }
    return {}


# ─────────────────────────────────────────
# LIFESPAN
# ─────────────────────────────────────────

@asynccontextmanager
async def lifespan(_app: FastAPI):
    """Application lifespan: startup and shutdown"""
    # Startup
    logger.info("Iniciando aplicación SmartContable")
    if settings.ENVIRONMENT == "production":
        logger.info("Producción: el esquema debe estar actualizado con Alembic")
    else:
        Base.metadata.create_all(bind=engine)
        logger.info("Base de datos inicializada")
    
    yield
    
    # Shutdown
    logger.info("Apagando aplicación SmartContable")


# ─────────────────────────────────────────
# APP INITIALIZATION
# ─────────────────────────────────────────

app = FastAPI(
    title="SAT Contabilidad API",
    description="Sistema contable con descarga automática del SAT",
    version="1.0.0",
    lifespan=lifespan
)

# CORS Middleware
_cors_origins = settings.CORS_ORIGINS or [
    "http://localhost:5173",
    "http://127.0.0.1:5173",
    "http://localhost:5174",
    "http://127.0.0.1:5174",
    "http://localhost:3000",
    "http://127.0.0.1:3000",
]
app.add_middleware(
    CORSMiddleware,
    allow_origins=_cors_origins,
    allow_origin_regex=r"^https?://(localhost|127\.0\.0\.1)(:\d+)?$",
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
    expose_headers=["Content-Disposition"],
)


# ─────────────────────────────────────────
# ERROR HANDLERS
# ─────────────────────────────────────────

@app.exception_handler(SmartContableException)
async def smartcontable_exception_handler(request: Request, exc: SmartContableException):
    """Handle SmartContableException"""
    logger.error(
        f"SmartContableException: {exc.code} — {exc.message}",
    )
    return JSONResponse(
        status_code=exc.status_code,
        content={
            "error": {
                "code": exc.code,
                "message": exc.message,
            }
        },
        headers=_cors_headers(request),
    )


@app.exception_handler(IntegrityError)
async def integrity_error_handler(request: Request, exc: IntegrityError):
    """Handle database integrity errors"""
    logger.error("Database integrity error", exc_info=True)
    return JSONResponse(
        status_code=409,
        content={
            "error": {
                "code": "INTEGRITY_ERROR",
                "message": "Los datos violan restricciones de integridad",
            }
        },
        headers=_cors_headers(request),
    )


@app.exception_handler(SQLAlchemyError)
async def sqlalchemy_error_handler(request: Request, exc: SQLAlchemyError):
    """Handle general SQLAlchemy errors"""
    logger.error("Database error", exc_info=True)
    
    # Don't expose database details in production
    message = "Error en base de datos"
    if settings.DEBUG:
        message = str(exc)
    
    return JSONResponse(
        status_code=500,
        content={
            "error": {
                "code": "DATABASE_ERROR",
                "message": message,
            }
        },
        headers=_cors_headers(request),
    )


@app.exception_handler(Exception)
async def general_exception_handler(request: Request, exc: Exception):
    """Handle unexpected exceptions"""
    logger.error("Unexpected error", exc_info=True)
    
    return JSONResponse(
        status_code=500,
        content={
            "error": {
                "code": "INTERNAL_SERVER_ERROR",
                "message": "Error interno del servidor" if not settings.DEBUG else str(exc),
            }
        },
        headers=_cors_headers(request),
    )


# ─────────────────────────────────────────
# ROUTES
# ─────────────────────────────────────────

app.include_router(api_router, prefix="/api/v1")


@app.get("/")
def root():
    """Root endpoint"""
    return {"status": "ok", "message": "SAT Contabilidad API corriendo"}


@app.get("/health")
def health():
    """Liveness check endpoint."""
    return {"status": "ok"}


@app.get("/ready")
def readiness(db: Session = Depends(get_db)):
    """Readiness check endpoint that verifies database connectivity."""
    from sqlalchemy import text

    try:
        db.execute(text("SELECT 1"))
        logger.info("Readiness check passed")
        return {"status": "ok", "database": "conectada"}
    except Exception:  # pylint: disable=broad-except
        logger.error("Readiness check failed", exc_info=True)
        raise HTTPException(
            status_code=503,
            detail="Base de datos no disponible",
        ) from None
