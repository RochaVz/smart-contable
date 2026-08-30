"""expand factura serie length

Revision ID: 6f4e1c2b9a11
Revises: 35b692510394
Create Date: 2026-08-11 00:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy import inspect


# revision identifiers, used by Alembic.
revision: str = '6f4e1c2b9a11'
down_revision: Union[str, Sequence[str], None] = '35b692510394'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    serie = next(
        column
        for column in inspect(op.get_bind()).get_columns("facturas")
        if column["name"] == "serie"
    )
    if getattr(serie["type"], "length", None) == 50:
        return

    op.alter_column(
        'facturas',
        'serie',
        existing_type=sa.String(length=10),
        type_=sa.String(length=50),
        existing_nullable=True,
    )


def downgrade() -> None:
    op.alter_column(
        'facturas',
        'serie',
        existing_type=sa.String(length=50),
        type_=sa.String(length=10),
        existing_nullable=True,
    )