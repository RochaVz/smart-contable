import os
import sys
from logging.config import fileConfig
from pathlib import Path

from sqlalchemy import engine_from_config
from sqlalchemy import pool

from alembic import context

# Agrega backend/ al sys.path para que los imports de app.* funcionen
sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

# Carga las variables de entorno desde .env antes de importar settings
from dotenv import load_dotenv
load_dotenv(Path(__file__).resolve().parents[1] / ".env")

# Neutraliza variables de entorno del sistema que puedan interferir con pydantic-settings
# (ej: DEBUG=release que Windows/VS Code inyecta en algunos entornos)
if os.environ.get("DEBUG", "").lower() not in ("true", "false", "1", "0", ""):
    os.environ["DEBUG"] = "false"

# Importa Base y todos los modelos para que SQLAlchemy los registre
from app.core.database import Base  # noqa: E402
import app.models  # noqa: E402, F401 — registra todos los modelos en Base.metadata

# this is the Alembic Config object, which provides
# access to the values within the .ini file in use.
config = context.config

# ConfigParser interpreta % como interpolación; las contraseñas URL-codificadas
# pueden contenerlo, por lo que se debe escapar antes de inyectar la URL.
database_url = os.environ["DATABASE_URL"].replace("%", "%%")
config.set_main_option("sqlalchemy.url", database_url)

# Interpret the config file for Python logging.
if config.config_file_name is not None:
    fileConfig(config.config_file_name)

# Apunta al metadata de tus modelos para que autogenerate funcione
target_metadata = Base.metadata

# other values from the config, defined by the needs of env.py,
# can be acquired:
# my_important_option = config.get_main_option("my_important_option")
# ... etc.


def run_migrations_offline() -> None:
    """Run migrations in 'offline' mode.

    This configures the context with just a URL
    and not an Engine, though an Engine is acceptable
    here as well.  By skipping the Engine creation
    we don't even need a DBAPI to be available.

    Calls to context.execute() here emit the given string to the
    script output.

    """
    url = config.get_main_option("sqlalchemy.url")
    context.configure(
        url=url,
        target_metadata=target_metadata,
        literal_binds=True,
        dialect_opts={"paramstyle": "named"},
    )

    with context.begin_transaction():
        context.run_migrations()


def run_migrations_online() -> None:
    """Run migrations in 'online' mode.

    In this scenario we need to create an Engine
    and associate a connection with the context.

    """
    connectable = engine_from_config(
        config.get_section(config.config_ini_section, {}),
        prefix="sqlalchemy.",
        poolclass=pool.NullPool,
    )

    with connectable.connect() as connection:
        context.configure(
            connection=connection, target_metadata=target_metadata
        )

        with context.begin_transaction():
            context.run_migrations()


if context.is_offline_mode():
    run_migrations_offline()
else:
    run_migrations_online()
