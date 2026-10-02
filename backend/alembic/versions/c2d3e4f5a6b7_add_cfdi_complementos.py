"""add cfdi complementos nomina pagos clasificaciones

Revision ID: c2d3e4f5a6b7
Revises: b1c2d3e4f5a6
Create Date: 2026-10-01
"""
# pylint: disable=no-member,not-callable
# pyright: reportAttributeAccessIssue=false

from alembic import op
import sqlalchemy as sa


revision = "c2d3e4f5a6b7"
down_revision = "b1c2d3e4f5a6"
branch_labels = None
depends_on = None


def upgrade() -> None:
    tipolineanomina = sa.Enum("percepcion", "deduccion", "otro_pago", name="tipolineanomina")
    tipoclasificacionespecial = sa.Enum(
        "arrendamiento", "intereses", "dividendos", name="tipoclasificacionespecial"
    )
    tipolineanomina.create(op.get_bind(), checkfirst=True)
    tipoclasificacionespecial.create(op.get_bind(), checkfirst=True)

    op.create_table(
        "cfdi_complementos_pago",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("empresa_id", sa.Integer(), nullable=False),
        sa.Column("uuid", sa.String(length=36), nullable=False),
        sa.Column("serie", sa.String(length=50), nullable=True),
        sa.Column("folio", sa.String(length=40), nullable=True),
        sa.Column("version_cfdi", sa.String(length=5), nullable=True),
        sa.Column("version_pagos", sa.String(length=10), nullable=True),
        sa.Column("fecha_emision", sa.DateTime(), nullable=True),
        sa.Column("fecha_timbrado", sa.DateTime(), nullable=True),
        sa.Column("rfc_emisor", sa.String(length=13), nullable=False),
        sa.Column("nombre_emisor", sa.String(length=255), nullable=True),
        sa.Column("rfc_receptor", sa.String(length=13), nullable=False),
        sa.Column("nombre_receptor", sa.String(length=255), nullable=True),
        sa.Column("moneda", sa.String(length=3), nullable=True),
        sa.Column("total", sa.Numeric(precision=15, scale=2), nullable=False),
        sa.Column("total_pagos", sa.Numeric(precision=15, scale=2), nullable=False),
        sa.Column("num_documentos", sa.Integer(), nullable=False),
        sa.Column("xml_contenido", sa.Text(), nullable=True),
        sa.Column("archivo_s3_key", sa.String(length=512), nullable=True),
        sa.Column("creado_en", sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.Column("actualizado_en", sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.ForeignKeyConstraint(["empresa_id"], ["empresas.id"]),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("empresa_id", "uuid", name="uq_cfdi_complemento_pago_empresa_uuid"),
    )
    for col in ("empresa_id", "uuid", "rfc_emisor", "rfc_receptor"):
        op.create_index(f"ix_cfdi_complementos_pago_{col}", "cfdi_complementos_pago", [col])
    op.create_index("ix_cfdi_complementos_pago_id", "cfdi_complementos_pago", ["id"])

    op.create_table(
        "cfdi_pago_documentos",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("empresa_id", sa.Integer(), nullable=False),
        sa.Column("complemento_pago_id", sa.Integer(), nullable=False),
        sa.Column("factura_id", sa.Integer(), nullable=True),
        sa.Column("uuid_cfdi_relacionado", sa.String(length=36), nullable=True),
        sa.Column("serie", sa.String(length=50), nullable=True),
        sa.Column("folio", sa.String(length=40), nullable=True),
        sa.Column("moneda_dr", sa.String(length=3), nullable=True),
        sa.Column("num_parcialidad", sa.Integer(), nullable=True),
        sa.Column("importe_saldo_anterior", sa.Numeric(precision=15, scale=2), nullable=False),
        sa.Column("importe_pagado", sa.Numeric(precision=15, scale=2), nullable=False),
        sa.Column("importe_saldo_insoluto", sa.Numeric(precision=15, scale=2), nullable=False),
        sa.Column("metodo_pago_dr", sa.String(length=5), nullable=True),
        sa.Column("objeto_imp_dr", sa.String(length=5), nullable=True),
        sa.Column("fecha_pago", sa.DateTime(), nullable=True),
        sa.Column("forma_pago_p", sa.String(length=5), nullable=True),
        sa.Column("creado_en", sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.ForeignKeyConstraint(["empresa_id"], ["empresas.id"]),
        sa.ForeignKeyConstraint(["complemento_pago_id"], ["cfdi_complementos_pago.id"]),
        sa.ForeignKeyConstraint(["factura_id"], ["facturas.id"]),
        sa.PrimaryKeyConstraint("id"),
    )
    for col in ("empresa_id", "complemento_pago_id", "factura_id", "uuid_cfdi_relacionado"):
        op.create_index(f"ix_cfdi_pago_documentos_{col}", "cfdi_pago_documentos", [col])
    op.create_index("ix_cfdi_pago_documentos_id", "cfdi_pago_documentos", ["id"])

    op.create_table(
        "cfdi_nominas",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("empresa_id", sa.Integer(), nullable=False),
        sa.Column("factura_id", sa.Integer(), nullable=False),
        sa.Column("version", sa.String(length=10), nullable=True),
        sa.Column("tipo_nomina", sa.String(length=5), nullable=True),
        sa.Column("fecha_pago", sa.DateTime(), nullable=True),
        sa.Column("fecha_inicial_pago", sa.DateTime(), nullable=True),
        sa.Column("fecha_final_pago", sa.DateTime(), nullable=True),
        sa.Column("num_dias_pagados", sa.Numeric(precision=8, scale=2), nullable=False),
        sa.Column("total_percepciones", sa.Numeric(precision=15, scale=2), nullable=False),
        sa.Column("total_deducciones", sa.Numeric(precision=15, scale=2), nullable=False),
        sa.Column("total_otros_pagos", sa.Numeric(precision=15, scale=2), nullable=False),
        sa.Column("total_sueldos", sa.Numeric(precision=15, scale=2), nullable=False),
        sa.Column("total_gravado", sa.Numeric(precision=15, scale=2), nullable=False),
        sa.Column("total_exento", sa.Numeric(precision=15, scale=2), nullable=False),
        sa.Column("isr_retenido", sa.Numeric(precision=15, scale=2), nullable=False),
        sa.Column("subsidio_causado", sa.Numeric(precision=15, scale=2), nullable=False),
        sa.Column("subsidio_entregado", sa.Numeric(precision=15, scale=2), nullable=False),
        sa.Column("snapshot_json", sa.Text(), nullable=True),
        sa.Column("creado_en", sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.Column("actualizado_en", sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.ForeignKeyConstraint(["empresa_id"], ["empresas.id"]),
        sa.ForeignKeyConstraint(["factura_id"], ["facturas.id"]),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("factura_id", name="uq_cfdi_nomina_factura"),
    )
    for col in ("empresa_id", "factura_id"):
        op.create_index(f"ix_cfdi_nominas_{col}", "cfdi_nominas", [col])
    op.create_index("ix_cfdi_nominas_id", "cfdi_nominas", ["id"])

    op.create_table(
        "cfdi_nomina_lineas",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("nomina_id", sa.Integer(), nullable=False),
        sa.Column("empresa_id", sa.Integer(), nullable=False),
        sa.Column("tipo_linea", tipolineanomina, nullable=False),
        sa.Column("tipo_clave", sa.String(length=10), nullable=True),
        sa.Column("clave", sa.String(length=30), nullable=True),
        sa.Column("concepto", sa.String(length=255), nullable=True),
        sa.Column("importe_gravado", sa.Numeric(precision=15, scale=2), nullable=False),
        sa.Column("importe_exento", sa.Numeric(precision=15, scale=2), nullable=False),
        sa.Column("importe", sa.Numeric(precision=15, scale=2), nullable=False),
        sa.Column("es_subsidio", sa.Boolean(), nullable=False, server_default=sa.text("0")),
        sa.Column("subsidio_causado", sa.Numeric(precision=15, scale=2), nullable=True),
        sa.Column("creado_en", sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.ForeignKeyConstraint(["nomina_id"], ["cfdi_nominas.id"]),
        sa.ForeignKeyConstraint(["empresa_id"], ["empresas.id"]),
        sa.PrimaryKeyConstraint("id"),
    )
    for col in ("nomina_id", "empresa_id", "tipo_linea"):
        op.create_index(f"ix_cfdi_nomina_lineas_{col}", "cfdi_nomina_lineas", [col])
    op.create_index("ix_cfdi_nomina_lineas_id", "cfdi_nomina_lineas", ["id"])

    op.create_table(
        "cfdi_clasificaciones_especiales",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("empresa_id", sa.Integer(), nullable=False),
        sa.Column("factura_id", sa.Integer(), nullable=False),
        sa.Column("tipo", tipoclasificacionespecial, nullable=False),
        sa.Column("clave_prod_serv", sa.String(length=20), nullable=True),
        sa.Column("descripcion", sa.String(length=500), nullable=True),
        sa.Column("importe", sa.Numeric(precision=15, scale=2), nullable=False),
        sa.Column("creado_en", sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.ForeignKeyConstraint(["empresa_id"], ["empresas.id"]),
        sa.ForeignKeyConstraint(["factura_id"], ["facturas.id"]),
        sa.PrimaryKeyConstraint("id"),
    )
    for col in ("empresa_id", "factura_id", "tipo"):
        op.create_index(f"ix_cfdi_clasificaciones_especiales_{col}", "cfdi_clasificaciones_especiales", [col])
    op.create_index("ix_cfdi_clasificaciones_especiales_id", "cfdi_clasificaciones_especiales", ["id"])


def downgrade() -> None:
    op.drop_table("cfdi_clasificaciones_especiales")
    op.drop_table("cfdi_nomina_lineas")
    op.drop_table("cfdi_nominas")
    op.drop_table("cfdi_pago_documentos")
    op.drop_table("cfdi_complementos_pago")
    sa.Enum(name="tipoclasificacionespecial").drop(op.get_bind(), checkfirst=True)
    sa.Enum(name="tipolineanomina").drop(op.get_bind(), checkfirst=True)
