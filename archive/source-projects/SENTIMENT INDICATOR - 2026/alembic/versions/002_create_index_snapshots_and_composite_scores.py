"""Create index_snapshots and composite_scores tables.

Revision ID: 002
Revises: 001
Create Date: 2025-02-19

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import JSONB

revision: str = "002"
down_revision: Union[str, None] = "001"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "index_snapshots",
        sa.Column("id", sa.Integer(), autoincrement=True, nullable=False),
        sa.Column("source", sa.String(64), nullable=False),
        sa.Column("value", sa.Float(), nullable=False),
        sa.Column("timestamp", sa.DateTime(timezone=True), nullable=False),
        sa.Column("meta", JSONB, nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(
        "ix_index_snapshots_source", "index_snapshots", ["source"], unique=False
    )
    op.create_index(
        "ix_index_snapshots_source_timestamp",
        "index_snapshots",
        ["source", "timestamp"],
        unique=False,
    )

    op.create_table(
        "composite_scores",
        sa.Column("id", sa.Integer(), autoincrement=True, nullable=False),
        sa.Column("score", sa.Float(), nullable=False),
        sa.Column("timestamp", sa.DateTime(timezone=True), nullable=False),
        sa.Column("components", JSONB, nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(
        "ix_composite_scores_timestamp",
        "composite_scores",
        ["timestamp"],
        unique=False,
    )


def downgrade() -> None:
    op.drop_index("ix_composite_scores_timestamp", table_name="composite_scores")
    op.drop_table("composite_scores")
    op.drop_index(
        "ix_index_snapshots_source_timestamp", table_name="index_snapshots"
    )
    op.drop_index("ix_index_snapshots_source", table_name="index_snapshots")
    op.drop_table("index_snapshots")
