"""add empresa fiscal options

Revision ID: f4a1b2c3d4e5
Revises: d7e8f9a0b1c2
Create Date: 2026-09-06
"""

from alembic import op
import sqlalchemy as sa
from sqlalchemy import inspect


revision = "f4a1b2c3d4e5"
down_revision = "d7e8f9a0b1c2"
branch_labels = None
depends_on = None


def upgrade() -> None:
    bind = op.get_bind()
    column_names = {column["name"] for column in inspect(bind).get_columns("empresas")}
    if bind.dialect.name == "mysql":
        op.execute(
            "ALTER TABLE empresas MODIFY regimen_fiscal "
            "ENUM('actividad_empresarial', 'sueldos_salarios', 'arrendamiento', "
            "'general_de_ley', 'personas_morales_no_lucrativas', "
            "'incorporacion_fiscal', 'resico_pf', 'resico_pm') NOT NULL"
        )
    if "opcion_deduccion" not in column_names:
        op.add_column(
            "empresas",
            sa.Column("opcion_deduccion", sa.Enum("CIEGA", "REAL", name="opciondeduccion"), nullable=True),
        )


def downgrade() -> None:
    op.drop_column("empresas", "opcion_deduccion")