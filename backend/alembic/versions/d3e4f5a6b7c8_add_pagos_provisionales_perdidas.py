"""add pagos provisionales y perdidas fiscales

Revision ID: d3e4f5a6b7c8
Revises: c2d3e4f5a6b7
Create Date: 2026-10-01 12:00:00.000000
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "d3e4f5a6b7c8"
down_revision: Union[str, Sequence[str], None] = "c2d3e4f5a6b7"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "pagos_provisionales_anteriores",
        sa.Column("id", sa.Integer(), primary_key=True, autoincrement=True),
        sa.Column("empresa_id", sa.Integer(), sa.ForeignKey("empresas.id"), nullable=False),
        sa.Column(
            "tipo_impuesto",
            sa.Enum("isr", "iva", "ieps", name="tipoimpuestoprovisional"),
            nullable=False,
        ),
        sa.Column("ejercicio", sa.Integer(), nullable=False),
        sa.Column("mes", sa.Integer(), nullable=False),
        sa.Column("monto", sa.Numeric(15, 2), nullable=False, server_default="0"),
        sa.Column("notas", sa.String(500), nullable=True),
        sa.Column("creado_en", sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.Column("actualizado_en", sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.UniqueConstraint(
            "empresa_id",
            "tipo_impuesto",
            "ejercicio",
            "mes",
            name="uq_pago_provisional_empresa_tipo_ejercicio_mes",
        ),
    )
    op.create_index("ix_pagos_provisionales_anteriores_id", "pagos_provisionales_anteriores", ["id"])
    op.create_index(
        "ix_pagos_provisionales_anteriores_empresa_id",
        "pagos_provisionales_anteriores",
        ["empresa_id"],
    )
    op.create_index(
        "ix_pagos_provisionales_anteriores_tipo_impuesto",
        "pagos_provisionales_anteriores",
        ["tipo_impuesto"],
    )
    op.create_index(
        "ix_pagos_provisionales_anteriores_ejercicio",
        "pagos_provisionales_anteriores",
        ["ejercicio"],
    )

    op.create_table(
        "perdidas_fiscales",
        sa.Column("id", sa.Integer(), primary_key=True, autoincrement=True),
        sa.Column("empresa_id", sa.Integer(), sa.ForeignKey("empresas.id"), nullable=False),
        sa.Column("ejercicio_origen", sa.Integer(), nullable=False),
        sa.Column("monto_original", sa.Numeric(15, 2), nullable=False, server_default="0"),
        sa.Column("monto_pendiente", sa.Numeric(15, 2), nullable=False, server_default="0"),
        sa.Column("ejercicio_limite", sa.Integer(), nullable=True),
        sa.Column("activa", sa.Boolean(), nullable=False, server_default=sa.text("1")),
        sa.Column("notas", sa.String(500), nullable=True),
        sa.Column("creado_en", sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.Column("actualizado_en", sa.DateTime(timezone=True), server_default=sa.func.now()),
    )
    op.create_index("ix_perdidas_fiscales_id", "perdidas_fiscales", ["id"])
    op.create_index("ix_perdidas_fiscales_empresa_id", "perdidas_fiscales", ["empresa_id"])
    op.create_index(
        "ix_perdidas_fiscales_ejercicio_origen",
        "perdidas_fiscales",
        ["ejercicio_origen"],
    )


def downgrade() -> None:
    op.drop_table("perdidas_fiscales")
    op.drop_table("pagos_provisionales_anteriores")
    sa.Enum(name="tipoimpuestoprovisional").drop(op.get_bind(), checkfirst=True)
