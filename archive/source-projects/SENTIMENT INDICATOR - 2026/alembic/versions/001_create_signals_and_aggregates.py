"""Create signals and aggregates tables.

Revision ID: 001
Revises:
Create Date: 2025-02-19

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

revision: str = "001"
down_revision: Union[str, None] = None
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "signals",
        sa.Column("id", sa.Integer(), autoincrement=True, nullable=False),
        sa.Column("asset_symbol", sa.String(32), nullable=False),
        sa.Column("source", sa.String(32), nullable=False),
        sa.Column("sentiment_score", sa.Float(), nullable=False),
        sa.Column("reason", sa.Text(), nullable=True),
        sa.Column("timestamp", sa.DateTime(timezone=True), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_signals_asset_symbol", "signals", ["asset_symbol"], unique=False)
    op.create_index(
        "ix_signals_asset_timestamp", "signals", ["asset_symbol", "timestamp"], unique=False
    )
    op.create_index("ix_signals_timestamp", "signals", ["timestamp"], unique=False)

    op.create_table(
        "aggregates",
        sa.Column("id", sa.Integer(), autoincrement=True, nullable=False),
        sa.Column("asset_symbol", sa.String(32), nullable=False),
        sa.Column("aggregated_score", sa.Float(), nullable=False),
        sa.Column("signal_count", sa.Integer(), nullable=False),
        sa.Column("entry_signal", sa.Boolean(), nullable=False),
        sa.Column("exit_signal", sa.Boolean(), nullable=False),
        sa.Column("stale", sa.Boolean(), nullable=False),
        sa.Column("window_start", sa.DateTime(timezone=True), nullable=False),
        sa.Column("window_end", sa.DateTime(timezone=True), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(
        "ix_aggregates_asset_symbol", "aggregates", ["asset_symbol"], unique=False
    )
    op.create_index(
        "ix_aggregates_asset_window",
        "aggregates",
        ["asset_symbol", "window_end"],
        unique=False,
    )


def downgrade() -> None:
    op.drop_index("ix_aggregates_asset_window", table_name="aggregates")
    op.drop_index("ix_aggregates_asset_symbol", table_name="aggregates")
    op.drop_table("aggregates")
    op.drop_index("ix_signals_timestamp", table_name="signals")
    op.drop_index("ix_signals_asset_timestamp", table_name="signals")
    op.drop_index("ix_signals_asset_symbol", table_name="signals")
    op.drop_table("signals")
