"""add factura concepto

Revision ID: g5h6i7j8k9l0
Revises: e1f2a3b4c5d6
Create Date: 2026-10-05
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy import inspect


revision: str = "g5h6i7j8k9l0"
down_revision: Union[str, Sequence[str], None] = "e1f2a3b4c5d6"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    bind = op.get_bind()
    columns = {column["name"] for column in inspect(bind).get_columns("facturas")}
    if "concepto" not in columns:
        op.add_column("facturas", sa.Column("concepto", sa.Text(), nullable=True))


def downgrade() -> None:
    bind = op.get_bind()
    columns = {column["name"] for column in inspect(bind).get_columns("facturas")}
    if "concepto" in columns:
        op.drop_column("facturas", "concepto")
