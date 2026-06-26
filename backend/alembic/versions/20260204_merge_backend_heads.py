"""merge backend heads

Revision ID: merge_backend_heads
Revises: create_schema_backend, init_backend
Create Date: 2026-02-04 19:00:00.000000
"""
from alembic import op

# revision identifiers, used by Alembic.
revision = 'merge_backend_heads'
down_revision = ('create_schema_backend', 'init_backend')
branch_labels = None
depends_on = None


def upgrade() -> None:
    # Merge migration: no schema changes, just unify multiple heads.
    pass


def downgrade() -> None:
    # Downgrade not supported for merge stub.
    pass
