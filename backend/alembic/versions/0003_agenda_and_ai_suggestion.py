"""agenda items, action items, and ai_suggestion on meetings

Revision ID: 0003
Revises: 0002
Create Date: 2026-10-27
"""

import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

from alembic import op

revision = "0003"
down_revision = "0002"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("meetings", sa.Column("ai_suggestion", postgresql.JSONB(), nullable=True))
    op.add_column("meetings", sa.Column("agenda_language", sa.String(length=16), nullable=True))

    op.create_table(
        "agenda_items",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column(
            "meeting_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("meetings.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("topic", sa.String(length=500), nullable=False),
        sa.Column("owner", sa.String(length=200), nullable=True),
        sa.Column("minutes", sa.Integer(), nullable=True),
        sa.Column("position", sa.Integer(), nullable=False, server_default="0"),
    )
    op.create_index("ix_agenda_items_meeting_id", "agenda_items", ["meeting_id"])

    op.create_table(
        "action_items",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column(
            "meeting_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("meetings.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("task", sa.String(length=500), nullable=False),
        sa.Column("owner", sa.String(length=200), nullable=True),
        sa.Column("due", sa.Date(), nullable=True),
        sa.Column("position", sa.Integer(), nullable=False, server_default="0"),
    )
    op.create_index("ix_action_items_meeting_id", "action_items", ["meeting_id"])


def downgrade() -> None:
    op.drop_index("ix_action_items_meeting_id", table_name="action_items")
    op.drop_table("action_items")
    op.drop_index("ix_agenda_items_meeting_id", table_name="agenda_items")
    op.drop_table("agenda_items")
    op.drop_column("meetings", "agenda_language")
    op.drop_column("meetings", "ai_suggestion")
