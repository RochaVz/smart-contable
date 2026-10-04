"""add movimiento banco conciliacion estado

Revision ID: e1f2a3b4c5d6
Revises: d3e4f5a6b7c8
Create Date: 2026-10-04 12:00:00.000000
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy import inspect


revision: str = "e1f2a3b4c5d6"
down_revision: Union[str, Sequence[str], None] = "d3e4f5a6b7c8"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    bind = op.get_bind()
    inspector = inspect(bind)
    columns = {column["name"] for column in inspector.get_columns("movimientos_banco")}

    if "poliza_id" not in columns:
        op.add_column(
            "movimientos_banco",
            sa.Column("poliza_id", sa.Integer(), sa.ForeignKey("polizas.id"), nullable=True),
        )
        op.create_index("ix_movimientos_banco_poliza_id", "movimientos_banco", ["poliza_id"])

    if "modo_conciliacion" not in columns:
        op.add_column(
            "movimientos_banco",
            sa.Column("modo_conciliacion", sa.String(length=20), nullable=True),
        )

    if "tipo_asignacion" not in columns:
        op.add_column(
            "movimientos_banco",
            sa.Column("tipo_asignacion", sa.String(length=20), nullable=True),
        )

    if "conciliado_en" not in columns:
        op.add_column(
            "movimientos_banco",
            sa.Column("conciliado_en", sa.DateTime(timezone=True), nullable=True),
        )

    if "updated_at" not in columns:
        op.add_column(
            "movimientos_banco",
            sa.Column(
                "updated_at",
                sa.DateTime(timezone=True),
                server_default=sa.text("NOW()"),
                nullable=True,
            ),
        )

    if "created_at" not in columns:
        op.add_column(
            "movimientos_banco",
            sa.Column(
                "created_at",
                sa.DateTime(timezone=True),
                server_default=sa.text("NOW()"),
                nullable=True,
            ),
        )


def downgrade() -> None:
    op.drop_column("movimientos_banco", "created_at")
    op.drop_column("movimientos_banco", "updated_at")
    op.drop_column("movimientos_banco", "conciliado_en")
    op.drop_column("movimientos_banco", "tipo_asignacion")
    op.drop_column("movimientos_banco", "modo_conciliacion")
    op.drop_index("ix_movimientos_banco_poliza_id", table_name="movimientos_banco")
    op.drop_column("movimientos_banco", "poliza_id")
