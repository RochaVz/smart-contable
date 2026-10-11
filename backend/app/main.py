from fastapi import FastAPI, status
from contextlib import asynccontextmanager
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy import text
from app.core.database import engine, Base, SessionLocal
from app.core.config import settings
from app.core.logger import get_logger
from app.api.v1.router import api_router
from app.schemas.common import SuccessResponse

# Importamos los modelos explícitamente para que SQLAlchemy los registre
from app.models.usuario import Usuario  # noqa: F401
from app.models.empresa import Empresa  # noqa: F401
from app.models.factura import Factura  # noqa: F401
from app.models.poliza import Poliza, MovimientoPoliza  # noqa: F401
from app.models.mapeo_cuenta import MapeoCuenta  # noqa: F401
from app.models.comision_banco import ComisionBanco  # noqa: F401
from app.models.conciliacion import EstadoCuentaCarga, MovimientoBanco  # noqa: F401

logger = get_logger(__name__)


# Definimos el gestor de ciclo de vida (Lifespan)
@asynccontextmanager
async def lifespan(_app: FastAPI):
    # Código que se ejecuta al iniciar la aplicación
    logger.info("Iniciando aplicación SAT Contabilidad API...")
    try:
        Base.metadata.create_all(bind=engine)
        logger.info("Base de datos inicializada correctamente")
    except Exception as e:
        logger.error(f"Error inicializando base de datos: {e}", exc_info=True)
        raise

    yield

    logger.info("Apagando aplicación...")


app = FastAPI(
    title="SAT Contabilidad API",
    description="Sistema contable con descarga automática del SAT",
    version="1.0.0",
    lifespan=lifespan
)

# Configurar CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.ALLOWED_ORIGINS,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(api_router, prefix="/api/v1")


@app.get("/", response_model=SuccessResponse)
def root():
    return SuccessResponse(
        message="SAT Contabilidad API corriendo",
        data={"version": "1.0.0"}
    )


@app.get("/health", response_model=SuccessResponse)
def health():
    """Health check público - valida disponibilidad de la BD"""
    db = SessionLocal()
    try:
        db.execute(text("SELECT 1"))
        logger.debug("Health check exitoso")
        return SuccessResponse(
            message="API y base de datos funcionando correctamente",
            data={"database": "ok", "environment": settings.ENVIRONMENT}
        )
    except Exception as e:
        logger.error(f"Health check fallido: {e}")
        return SuccessResponse(
            status="error",
            message="Base de datos no disponible",
            data={"database": "error"}
        )
    finally:
        db.close()

