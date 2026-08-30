"""add s3 file keys

Revision ID: d7e8f9a0b1c2
Revises: c3f84a91d2aa
Create Date: 2026-08-30
"""

from alembic import op
import sqlalchemy as sa
from sqlalchemy import inspect


revision = "d7e8f9a0b1c2"
down_revision = "c3f84a91d2aa"
branch_labels = None
depends_on = None


def upgrade() -> None:
    inspector = inspect(op.get_bind())
    factura_columns = {column["name"] for column in inspector.get_columns("facturas")}
    carga_columns = {
        column["name"]
        for column in inspector.get_columns("estados_cuenta_cargas")
    }
    if "archivo_s3_key" not in factura_columns:
        op.add_column("facturas", sa.Column("archivo_s3_key", sa.String(length=512), nullable=True))
    if "archivo_s3_key" not in carga_columns:
        op.add_column("estados_cuenta_cargas", sa.Column("archivo_s3_key", sa.String(length=512), nullable=True))


def downgrade() -> None:
    op.drop_column("estados_cuenta_cargas", "archivo_s3_key")
    op.drop_column("facturas", "archivo_s3_key")