"""Weekly meetings report: queries the database and returns a CSV as bytes.

This function has no AWS imports. It works against the local compose
database as well as the production Aurora cluster.  The Lambda handlers
import it and pass the result to S3.
"""

from __future__ import annotations

import asyncio
import csv
import io
import logging
from datetime import datetime, timedelta, timezone
from typing import Any

from sqlalchemy import text
from sqlalchemy.ext.asyncio import async_sessionmaker, create_async_engine
from sqlalchemy.pool import NullPool

from app.config import settings

log = logging.getLogger(__name__)


def _iso_week_bounds(week: str) -> tuple[datetime, datetime]:
    """Return (monday_00:00 UTC, next_monday_00:00 UTC) for an ISO week string.

    Args:
        week: ISO week string like "2026-W40".

    Returns:
        Tuple of (start, end) as UTC-aware datetimes.
    """
    # Parse "2026-W40" → the Monday of that week.
    monday = datetime.strptime(f"{week}-1", "%G-W%V-%u").replace(tzinfo=timezone.utc)
    next_monday = monday + timedelta(weeks=1)
    return monday, next_monday


def _previous_iso_week(week: str) -> str:
    """Return the ISO week string for the week before *week*."""
    monday, _ = _iso_week_bounds(week)
    prev_monday = monday - timedelta(weeks=1)
    return prev_monday.strftime("%G-W%V")


def _week_stats(session_sync, start: datetime, end: datetime) -> dict[str, Any]:
    """Return aggregate stats for meetings in [start, end)."""
    row = session_sync.execute(
        text(
            """
            SELECT
                COUNT(*)                                        AS total_meetings,
                COALESCE(SUM(
                    EXTRACT(EPOCH FROM (ends_at - starts_at)) / 3600
                ), 0)                                           AS total_hours
            FROM meetings
            WHERE starts_at >= :start AND starts_at < :end
            """
        ),
        {"start": start, "end": end},
    ).fetchone()
    return {
        "total_meetings": int(row.total_meetings),
        "total_hours": round(float(row.total_hours), 2),
    }


def _top5(session_sync, start: datetime, end: datetime) -> list[dict[str, Any]]:
    """Return the five longest meetings in [start, end)."""
    rows = session_sync.execute(
        text(
            """
            SELECT
                m.name,
                m.starts_at,
                ROUND(
                    EXTRACT(EPOCH FROM (m.ends_at - m.starts_at)) / 3600,
                    2
                )                      AS duration_hours,
                COUNT(p.id)            AS participant_count
            FROM meetings m
            LEFT JOIN participants p ON p.meeting_id = m.id
            WHERE m.starts_at >= :start AND m.starts_at < :end
            GROUP BY m.id, m.name, m.starts_at, m.ends_at
            ORDER BY (m.ends_at - m.starts_at) DESC
            LIMIT 5
            """
        ),
        {"start": start, "end": end},
    ).fetchall()
    return [
        {
            "title": r.name,
            "start": r.starts_at.isoformat(),
            "duration_hours": float(r.duration_hours),
            "participants": int(r.participant_count),
        }
        for r in rows
    ]


def build_weekly_report(week: str) -> bytes:
    """Query the meetings of one ISO week (e.g. "2026-W40") and return the CSV.

    The week parameter makes the function fully deterministic: the same week
    always produces the same S3 key, so running it twice overwrites the first
    file rather than creating two (idempotent).

    Args:
        week: ISO week string like "2026-W40".

    Returns:
        UTF-8 encoded CSV bytes.
    """
    start, end = _iso_week_bounds(week)
    prev_week = _previous_iso_week(week)
    prev_start, prev_end = _iso_week_bounds(prev_week)

    log.info("building report", extra={"week": week, "start": start.isoformat(), "end": end.isoformat()})

    async def _run() -> bytes:
        engine = create_async_engine(settings.database_url, poolclass=NullPool)
        session_factory = async_sessionmaker(engine, expire_on_commit=False, autoflush=False)
        try:
            async with session_factory() as session:
                def _query(conn):
                    curr = _week_stats(conn, start, end)
                    prev = _week_stats(conn, prev_start, prev_end)
                    top5 = _top5(conn, start, end)
                    return curr, prev, top5

                curr, prev, top5 = await session.run_sync(_query)
        finally:
            await engine.dispose()

        buf = io.StringIO()
        w = csv.writer(buf)

        # --- Summary section ---
        w.writerow(["Weekly Meetings Report", week])
        w.writerow([])
        w.writerow(["Metric", "This week", "Previous week", "Change"])
        w.writerow([
            "Total meetings",
            curr["total_meetings"],
            prev["total_meetings"],
            curr["total_meetings"] - prev["total_meetings"],
        ])
        w.writerow([
            "Total hours",
            curr["total_hours"],
            prev["total_hours"],
            round(curr["total_hours"] - prev["total_hours"], 2),
        ])

        # --- Top-5 longest meetings ---
        w.writerow([])
        w.writerow(["Top 5 longest meetings this week"])
        w.writerow(["Title", "Start (UTC)", "Duration (h)", "Participants"])
        for m in top5:
            w.writerow([m["title"], m["start"], m["duration_hours"], m["participants"]])

        return buf.getvalue().encode("utf-8")

    return asyncio.run(_run())

