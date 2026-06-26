"""baseline backend

Revision ID: baseline_backend
Revises:
Create Date: 2026-02-02 20:00:00.000000
"""
from alembic import op
import sqlalchemy as sa

# revision identifiers, used by Alembic.
revision = 'baseline_backend'
down_revision = None
branch_labels = None
depends_on = None


def upgrade() -> None:
    # Baseline: no-op migration. The current DB is considered the baseline for this service.
    pass


def downgrade() -> None:
    # Nothing to revert for baseline
    pass
