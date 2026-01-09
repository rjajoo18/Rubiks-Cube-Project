# dashboard.py
from __future__ import annotations

from flask import Blueprint, request, jsonify
from datetime import datetime, timedelta
from sqlalchemy import func, case
from db import db
from models import Solve, DashboardSnapshot
from auth import require_auth

dashboard_bp = Blueprint("dashboard", __name__)

def parse_range(range_str: str) -> int:
    if not range_str or not range_str.endswith("d"):
        return 30
    try:
        return int(range_str[:-1])
    except ValueError:
        return 30

def _effective_time_expr():
    """
    SQL expression for effective time:
      - DNF => NULL (excluded from stats)
      - +2 => time_ms + 2000
      - OK => time_ms
    """
    return case(
        (Solve.penalty == "DNF", None),
        (Solve.time_ms.is_(None), None),
        (Solve.penalty == "+2", Solve.time_ms + 2000),
        else_=Solve.time_ms,
    )

def _aoN(arr: list[int], n: int) -> int | None:
    """
    WCA-style trimmed mean:
      - sort first N
      - drop best/worst
      - average the rest
    """
    if len(arr) < n:
        return None
    w = sorted(arr[:n])
    trimmed = w[1:-1]
    return sum(trimmed) // len(trimmed)

def compute_dashboard_payload(user_id: int, range_str: str) -> dict:
    """
    Computes the dashboard payload using SQL aggregates.
    This avoids loading all solves into Python.
    """
    days = parse_range(range_str)
    since = datetime.utcnow() - timedelta(days=days)

    effective_expr = _effective_time_expr()
    day_expr = func.date_trunc("day", Solve.created_at)

    # -----------------------------
    # A) Counts (SQL)
    # -----------------------------
    counts_row = (
        db.session.query(
            func.count(Solve.id).label("solves"),
            func.sum(case((Solve.penalty == "DNF", 1), else_=0)).label("dnf"),
            func.sum(case((Solve.penalty == "+2", 1), else_=0)).label("plus2"),
        )
        .filter(Solve.user_id == user_id)
        .filter(Solve.created_at >= since)
        .one()
    )

    counts = {
        "solves": int(counts_row.solves or 0),
        "dnf": int(counts_row.dnf or 0),
        "plus2": int(counts_row.plus2 or 0),
    }

    # -----------------------------
    # B) Best/Worst/Avg time (SQL)
    # -----------------------------
    time_row = (
        db.session.query(
            func.min(effective_expr).label("bestMs"),
            func.max(effective_expr).label("worstMs"),
            func.avg(effective_expr).label("avgMs"),
        )
        .filter(Solve.user_id == user_id)
        .filter(Solve.created_at >= since)
        .one()
    )

    bestMs = int(time_row.bestMs) if time_row.bestMs is not None else None
    worstMs = int(time_row.worstMs) if time_row.worstMs is not None else None
    avgMs = int(time_row.avgMs) if time_row.avgMs is not None else None

    # AO5/AO12 need the last 12 effective times only (tiny query + python)
    last_times_rows = (
        db.session.query(effective_expr.label("t"))
        .filter(Solve.user_id == user_id)
        .filter(Solve.created_at >= since)
        .order_by(Solve.created_at.desc(), Solve.id.desc())
        .limit(12)
        .all()
    )
    last_times = []
    for row in last_times_rows:
        val = None
        try:
            val = row[0]       
        except Exception:
            val = getattr(row, "t", None)

        if val is not None:
            last_times.append(int(val))


    timeStats = {
        "bestMs": bestMs,
        "worstMs": worstMs,
        "avgMs": avgMs,
        "ao5Ms": _aoN(last_times, 5),
        "ao12Ms": _aoN(last_times, 12),
    }

    # -----------------------------
    # C) Score stats (SQL)
    # -----------------------------
    score_row = (
        db.session.query(
            func.avg(Solve.ml_score).label("avgScore"),
            func.max(Solve.ml_score).label("bestScore"),
        )
        .filter(Solve.user_id == user_id)
        .filter(Solve.created_at >= since)
        .one()
    )

    scoreStats = {
        "avgScore": float(score_row.avgScore) if score_row.avgScore is not None else None,
        "bestScore": float(score_row.bestScore) if score_row.bestScore is not None else None,
    }

    # -----------------------------
    # D) Daily trend buckets (SQL)
    # -----------------------------
    daily_rows = (
        db.session.query(
            day_expr.label("day"),
            func.count(Solve.id).label("count"),
            func.avg(effective_expr).label("avgMs"),
            func.avg(Solve.ml_score).label("avgScore"),
        )
        .filter(Solve.user_id == user_id)
        .filter(Solve.created_at >= since)
        .group_by(day_expr)
        .order_by(day_expr.asc())
        .all()
    )

    daily = []
    for r in daily_rows:
        daily.append({
            "date": r.day.date().isoformat(),
            "avgMs": int(r.avgMs) if r.avgMs is not None else None,
            "avgScore": float(r.avgScore) if r.avgScore is not None else None,
            "count": int(r.count),
        })

    return {
        "range": range_str,
        "counts": counts,
        "timeStats": timeStats,
        "scoreStats": scoreStats,
        "trend": {"daily": daily},
    }

def refresh_dashboard_snapshot(user_id: int, range_str: str = "30d") -> None:
    """
    Write-through cache: recompute and store snapshot so dashboard reads are O(1).
    """
    days = parse_range(range_str)
    payload = compute_dashboard_payload(user_id, range_str)

    snap = DashboardSnapshot.query.filter_by(user_id=user_id, range_days=days).first()
    if snap is None:
        snap = DashboardSnapshot(user_id=user_id, range_days=days, data=payload)
        db.session.add(snap)
    else:
        snap.data = payload
        snap.updated_at = datetime.utcnow()

    db.session.commit()

# GET /api/dashboard/summary?range=30d
@dashboard_bp.route("/dashboard/summary", methods=["GET"])
@require_auth
def summary():
    user = request.current_user
    range_str = request.args.get("range", "30d")
    days = parse_range(range_str)

    # 1) Try snapshot first (fast path)
    snap = DashboardSnapshot.query.filter_by(user_id=user.id, range_days=days).first()
    if snap is not None:
        return jsonify(snap.data), 200

    # 2) If missing, compute and store snapshot (first request penalty)
    payload = compute_dashboard_payload(user.id, range_str)

    # store it so next call is instant
    new_snap = DashboardSnapshot(
        user_id=user.id,
        range_days=days,
        data=payload,
        updated_at=datetime.utcnow(),
    )
    db.session.add(new_snap)
    db.session.commit()

    return jsonify(payload), 200
