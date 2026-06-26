"""Add Trilha and AlunoTrilha models

Revision ID: add_trilha_models
Revises: add_split_phone_fields
Create Date: 2026-05-18 00:00:00.000000
"""
from alembic import op
import sqlalchemy as sa


revision = 'add_trilha_models'
down_revision = 'add_split_phone_fields'
branch_labels = None
depends_on = None


def upgrade() -> None:
    # Create Trilhas table
    op.create_table(
        'Trilhas',
        sa.Column('IdTrilha', sa.String(length=36), nullable=False),
        sa.Column('NomeTrilha', sa.String(length=150), nullable=False),
        sa.Column('DescricaoTrilha', sa.Text(), nullable=True),
        sa.Column('QtdCursos', sa.Integer(), nullable=False, server_default='0'),
        sa.Column('DeletedAt', sa.DateTime(), nullable=True),
        sa.PrimaryKeyConstraint('IdTrilha'),
        sa.Index('ix_Trilhas_NomeTrilha', 'NomeTrilha'),
    )

    # Create Alunos_Trilhas junction table
    op.create_table(
        'Alunos_Trilhas',
        sa.Column('IdAlunoTrilha', sa.String(length=36), nullable=False),
        sa.Column('IdAluno', sa.String(length=36), nullable=False),
        sa.Column('IdTrilha', sa.String(length=36), nullable=False),
        sa.Column('NotaTrilha', sa.Float(), nullable=True),
        sa.Column('DeletedAt', sa.DateTime(), nullable=True),
        sa.ForeignKeyConstraint(['IdAluno'], ['Alunos.IdAluno'], ),
        sa.ForeignKeyConstraint(['IdTrilha'], ['Trilhas.IdTrilha'], ondelete='CASCADE'),
        sa.PrimaryKeyConstraint('IdAlunoTrilha'),
    )


def downgrade() -> None:
    # Drop Alunos_Trilhas table first (due to foreign keys)
    op.drop_table('Alunos_Trilhas')

    # Drop Trilhas table
    op.drop_table('Trilhas')
