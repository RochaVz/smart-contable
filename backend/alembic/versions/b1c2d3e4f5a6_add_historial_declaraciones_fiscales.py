"""add historial de declaraciones fiscales

Revision ID: b1c2d3e4f5a6
Revises: a8c7d6e5f4b3
Create Date: 2026-10-01
"""
# pylint: disable=no-member,not-callable
# pyright: reportAttributeAccessIssue=false

from alembic import op
import sqlalchemy as sa


revision = "b1c2d3e4f5a6"
down_revision = "a8c7d6e5f4b3"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "declaraciones_fiscales",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("empresa_id", sa.Integer(), nullable=False),
        sa.Column("periodo_id", sa.Integer(), nullable=False),
        sa.Column("usuario_id", sa.Integer(), nullable=True),
        sa.Column(
            "tipo",
            sa.Enum("isr", "iva", "diot", "anual", "ieps", name="tipodeclaracionfiscal"),
            nullable=False,
        ),
        sa.Column(
            "estado",
            sa.Enum(
                "borrador",
                "calculada",
                "presentada",
                "modificada",
                "cancelada",
                name="estadodeclaracionfiscal",
            ),
            nullable=False,
        ),
        sa.Column("version", sa.Integer(), nullable=False, server_default="1"),
        sa.Column("es_vigente", sa.Boolean(), nullable=False, server_default=sa.text("1")),
        sa.Column("declaracion_origen_id", sa.Integer(), nullable=True),
        sa.Column("version_anterior_id", sa.Integer(), nullable=True),
        sa.Column("base_gravable", sa.Numeric(precision=15, scale=2), nullable=False, server_default="0"),
        sa.Column("isr_causado", sa.Numeric(precision=15, scale=2), nullable=False, server_default="0"),
        sa.Column("iva_trasladado", sa.Numeric(precision=15, scale=2), nullable=False, server_default="0"),
        sa.Column("iva_acreditable", sa.Numeric(precision=15, scale=2), nullable=False, server_default="0"),
        sa.Column("iva_retenido", sa.Numeric(precision=15, scale=2), nullable=False, server_default="0"),
        sa.Column("monto_a_cargo", sa.Numeric(precision=15, scale=2), nullable=False, server_default="0"),
        sa.Column("monto_a_favor", sa.Numeric(precision=15, scale=2), nullable=False, server_default="0"),
        sa.Column("snapshot_calculo", sa.Text(), nullable=True),
        sa.Column("motivo_modificacion", sa.String(length=500), nullable=True),
        sa.Column("notas", sa.Text(), nullable=True),
        sa.Column("fecha_presentacion", sa.DateTime(timezone=True), nullable=True),
        sa.Column("creado_en", sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.Column("actualizado_en", sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.ForeignKeyConstraint(["empresa_id"], ["empresas.id"]),
        sa.ForeignKeyConstraint(["periodo_id"], ["periodos_fiscales.id"]),
        sa.ForeignKeyConstraint(["usuario_id"], ["usuarios.id"]),
        sa.ForeignKeyConstraint(["declaracion_origen_id"], ["declaraciones_fiscales.id"]),
        sa.ForeignKeyConstraint(["version_anterior_id"], ["declaraciones_fiscales.id"]),
        sa.PrimaryKeyConstraint("id"),
    )
    for column in (
        "empresa_id",
        "periodo_id",
        "usuario_id",
        "tipo",
        "estado",
        "es_vigente",
        "declaracion_origen_id",
        "version_anterior_id",
    ):
        op.create_index(f"ix_declaraciones_fiscales_{column}", "declaraciones_fiscales", [column])

    op.create_table(
        "historial_fiscal",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("empresa_id", sa.Integer(), nullable=False),
        sa.Column("usuario_id", sa.Integer(), nullable=True),
        sa.Column(
            "entidad_tipo",
            sa.Enum("declaracion", "operacion", "periodo", name="tipoentidadhistorialfiscal"),
            nullable=False,
        ),
        sa.Column("entidad_id", sa.Integer(), nullable=False),
        sa.Column(
            "accion",
            sa.Enum(
                "crear",
                "actualizar",
                "presentar",
                "modificar",
                "cancelar",
                name="accionhistorialfiscal",
            ),
            nullable=False,
        ),
        sa.Column("resumen", sa.String(length=255), nullable=False),
        sa.Column("detalle_antes", sa.Text(), nullable=True),
        sa.Column("detalle_despues", sa.Text(), nullable=True),
        sa.Column("motivo", sa.String(length=500), nullable=True),
        sa.Column("creado_en", sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.ForeignKeyConstraint(["empresa_id"], ["empresas.id"]),
        sa.ForeignKeyConstraint(["usuario_id"], ["usuarios.id"]),
        sa.PrimaryKeyConstraint("id"),
    )
    for column in ("empresa_id", "usuario_id", "entidad_tipo", "entidad_id", "accion", "creado_en"):
        op.create_index(f"ix_historial_fiscal_{column}", "historial_fiscal", [column])


def downgrade() -> None:
    op.drop_table("historial_fiscal")
    op.drop_table("declaraciones_fiscales")
    sa.Enum(name="accionhistorialfiscal").drop(op.get_bind(), checkfirst=True)
    sa.Enum(name="tipoentidadhistorialfiscal").drop(op.get_bind(), checkfirst=True)
    sa.Enum(name="estadodeclaracionfiscal").drop(op.get_bind(), checkfirst=True)
    sa.Enum(name="tipodeclaracionfiscal").drop(op.get_bind(), checkfirst=True)
