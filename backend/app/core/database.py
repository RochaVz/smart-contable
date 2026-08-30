from pathlib import Path

from sqlalchemy import create_engine
from sqlalchemy.orm import declarative_base, sessionmaker

from app.core.config import settings

_is_sqlite = settings.DATABASE_URL.startswith("sqlite")

if _is_sqlite:
    sqlite_path = settings.DATABASE_URL.removeprefix("sqlite:///")
    if sqlite_path not in {":memory:", ""}:
        Path(sqlite_path).parent.mkdir(parents=True, exist_ok=True)

# SQLite no soporta los argumentos de QueuePool y requiere check_same_thread=False.
_engine_kwargs = (
    {"connect_args": {"check_same_thread": False}}
    if _is_sqlite
    else {
        "pool_size": settings.DATABASE_POOL_SIZE,
        "max_overflow": settings.DATABASE_MAX_OVERFLOW,
        "pool_timeout": settings.DATABASE_POOL_TIMEOUT_SECONDS,
    }
)

engine = create_engine(
    settings.DATABASE_URL,
    pool_pre_ping=True,
    future=True,
    echo=settings.DEBUG,
    **_engine_kwargs,
)

SessionLocal = sessionmaker(
    autocommit=False,
    autoflush=False,
    bind=engine,
    future=True,
    expire_on_commit=False
)

Base = declarative_base()


def get_db():
    db = SessionLocal()

    try:
        yield db

    finally:
        db.close()