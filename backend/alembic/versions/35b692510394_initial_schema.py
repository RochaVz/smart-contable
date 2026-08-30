"""initial_schema

Revision ID: 35b692510394
Revises: 
Create Date: 2026-08-01 20:31:02.447250

"""
from alembic import op
from app.core.database import Base
import app.models  # noqa: F401


# revision identifiers, used by Alembic.
revision = '35b692510394'
down_revision = None
branch_labels = None
depends_on = None


def upgrade() -> None:
    Base.metadata.create_all(bind=op.get_bind())


def downgrade() -> None:
    Base.metadata.drop_all(bind=op.get_bind())
