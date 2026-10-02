#!/bin/bash
set -euo pipefail
cd /opt/smartcontable
docker compose -f docker-compose.prod.yml exec -T backend alembic current
docker compose -f docker-compose.prod.yml exec -T backend python - <<'PY'
from sqlalchemy import text, create_engine
from app.core.config import settings

engine = create_engine(settings.DATABASE_URL)
tables = [
    "declaraciones_fiscales",
    "historial_fiscal",
    "cfdi_complementos_pago",
    "cfdi_pago_documentos",
    "cfdi_nominas",
    "cfdi_nomina_lineas",
    "cfdi_clasificaciones_especiales",
    "pagos_provisionales_anteriores",
    "perdidas_fiscales",
    "periodos_fiscales",
    "operaciones_fiscales",
]
with engine.connect() as conn:
    version = conn.execute(text("select version_num from alembic_version")).scalar()
    print(f"alembic_version={version}")
    for table in tables:
        exists = conn.execute(
            text(
                "select count(*) from information_schema.tables "
                "where table_schema = database() and table_name = :table_name"
            ),
            {"table_name": table},
        ).scalar()
        print(f"{table}={'OK' if exists else 'MISSING'}")
PY
docker compose -f docker-compose.prod.yml exec -T backend python - <<'PY'
import urllib.request
print("backend_health=", urllib.request.urlopen("http://127.0.0.1:8000/health", timeout=10).status)
PY
