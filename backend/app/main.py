from fastapi import FastAPI
from contextlib import asynccontextmanager
from fastapi.middleware.cors import CORSMiddleware
from app.core.database import engine, Base
from app.api.v1.router import api_router
# Importamos los modelos explícitamente para que SQLAlchemy los registre
from app.models.usuario import Usuario  # noqa: F401
from app.models.empresa import Empresa  # noqa: F401
from app.models.factura import Factura  # noqa: F401
from app.models.poliza import Poliza, MovimientoPoliza # noqa: F401 
from app.models.mapeo_cuenta import MapeoCuenta # noqa: F401
from app.models.comision_banco import ComisionBanco # noqa: F401
from app.models.conciliacion import EstadoCuentaCarga, MovimientoBanco # noqa: F401


# Definimos el gestor de ciclo de vida (Lifespan)
@asynccontextmanager
async def lifespan(_app: FastAPI):
    # Código que se ejecuta al iniciar la aplicación
    Base.metadata.create_all(bind=engine)
    yield
    # Aquí puedes añadir código que se ejecute al apagar la aplicación si lo necesitas

app = FastAPI(
    title="SAT Contabilidad API",
    description="Sistema contable con descarga automática del SAT",
    version="1.0.0",
    lifespan=lifespan # Aquí conectamos el lifespan
)

# Configurar quién puede conectarse a tu API
app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:3000",   # React viejo
        "http://127.0.0.1:3000",
        "http://localhost:5173",   # <--- ESTE ES EL TUYO (Vite)
        "http://127.0.0.1:5173",], # La URL de tu React
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(api_router, prefix="/api/v1")

@app.get("/")
def root():
    return {"status": "ok", "message": "SAT Contabilidad API corriendo"}

@app.get("/health")
def health():
    from sqlalchemy import text
    from app.core.database import SessionLocal
    db = SessionLocal()
    try:
        db.execute(text("SELECT 1"))
        return {"status": "ok", "database": "conectada"}
    except Exception as e:  # pylint: disable=broad-except
        return {"status": "error", "database": str(e)}
    finally:
        db.close()
