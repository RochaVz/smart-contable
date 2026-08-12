"""mapeo cuentas reglas configurables

Revision ID: 9b2ad1e77c31
Revises: 6f4e1c2b9a11
Create Date: 2026-08-11

"""

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = "9b2ad1e77c31"
down_revision = "6f4e1c2b9a11"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("mapeo_cuentas", sa.Column("tipo_regla", sa.String(length=20), nullable=True))
    op.add_column("mapeo_cuentas", sa.Column("patron", sa.String(length=120), nullable=True))

    op.execute("UPDATE mapeo_cuentas SET tipo_regla = 'rfc' WHERE tipo_regla IS NULL")

    op.alter_column(
        "mapeo_cuentas",
        "tipo_regla",
        existing_type=sa.String(length=20),
        nullable=False,
        server_default="rfc",
    )


def downgrade() -> None:
    op.drop_column("mapeo_cuentas", "patron")
    op.drop_column("mapeo_cuentas", "tipo_regla")
