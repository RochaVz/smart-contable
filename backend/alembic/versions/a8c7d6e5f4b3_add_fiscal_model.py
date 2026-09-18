"""add fiscal periods and auditable operations

Revision ID: a8c7d6e5f4b3
Revises: f4a1b2c3d4e5
Create Date: 2026-09-17
"""

from alembic import op
import sqlalchemy as sa


revision = "a8c7d6e5f4b3"
down_revision = "f4a1b2c3d4e5"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "periodos_fiscales",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("empresa_id", sa.Integer(), nullable=False),
        sa.Column("tipo", sa.Enum("mensual", "anual", name="tipoperiodofiscal"), nullable=False),
        sa.Column("anio", sa.Integer(), nullable=False),
        sa.Column("mes", sa.Integer(), nullable=True),
        sa.Column("creado_en", sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.Column("actualizado_en", sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.ForeignKeyConstraint(["empresa_id"], ["empresas.id"]),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint(
            "empresa_id",
            "tipo",
            "anio",
            "mes",
            name="uq_periodo_fiscal_empresa_tipo_anio_mes",
        ),
    )
    op.create_index("ix_periodos_fiscales_empresa_id", "periodos_fiscales", ["empresa_id"])
    op.create_index("ix_periodos_fiscales_anio", "periodos_fiscales", ["anio"])
    op.create_index("ix_periodos_fiscales_mes", "periodos_fiscales", ["mes"])

    op.create_table(
        "operaciones_fiscales",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("empresa_id", sa.Integer(), nullable=False),
        sa.Column("periodo_id", sa.Integer(), nullable=False),
        sa.Column("factura_id", sa.Integer(), nullable=True),
        sa.Column("tipo_operacion", sa.Enum("ingreso", "egreso", "nomina", "pago", "ajuste", name="tipooperacionfiscal"), nullable=False),
        sa.Column("origen", sa.Enum("cfdi", "poliza", "manual", name="origenoperacionfiscal"), nullable=False),
        sa.Column("referencia_origen", sa.String(length=100), nullable=False),
        sa.Column("rfc_contraparte", sa.String(length=13), nullable=True),
        sa.Column("nombre_contraparte", sa.String(length=255), nullable=True),
        sa.Column("tipo_operacion_diot", sa.Enum("nacional", "extranjero", "global", name="tipooperaciondiot"), nullable=True),
        sa.Column("base_gravable", sa.Numeric(precision=15, scale=2), nullable=False, server_default="0"),
        sa.Column("iva_trasladado", sa.Numeric(precision=15, scale=2), nullable=False, server_default="0"),
        sa.Column("iva_acreditable", sa.Numeric(precision=15, scale=2), nullable=False, server_default="0"),
        sa.Column("iva_retenido", sa.Numeric(precision=15, scale=2), nullable=False, server_default="0"),
        sa.Column("isr_retenido", sa.Numeric(precision=15, scale=2), nullable=False, server_default="0"),
        sa.Column("ieps", sa.Numeric(precision=15, scale=2), nullable=False, server_default="0"),
        sa.Column("total", sa.Numeric(precision=15, scale=2), nullable=False, server_default="0"),
        sa.Column("notas", sa.Text(), nullable=True),
        sa.Column("creado_en", sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.Column("actualizado_en", sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.ForeignKeyConstraint(["empresa_id"], ["empresas.id"]),
        sa.ForeignKeyConstraint(["periodo_id"], ["periodos_fiscales.id"]),
        sa.ForeignKeyConstraint(["factura_id"], ["facturas.id"]),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint(
            "empresa_id",
            "origen",
            "referencia_origen",
            name="uq_operacion_fiscal_empresa_origen_referencia",
        ),
    )
    for column in ("empresa_id", "periodo_id", "factura_id", "tipo_operacion", "rfc_contraparte", "tipo_operacion_diot"):
        op.create_index(f"ix_operaciones_fiscales_{column}", "operaciones_fiscales", [column])


def downgrade() -> None:
    op.drop_table("operaciones_fiscales")
    op.drop_table("periodos_fiscales")