from flask import Blueprint, request, jsonify
from datetime import datetime, timedelta
from models import Solve
from auth import require_auth

dashboard_bp = Blueprint("dashboard", __name__)

def parse_range(range_str: str) -> int:
    if not range_str or not range_str.endswith("d"):
        return 30
    try:
        return int(range_str[:-1])
    except ValueError:
        return 30  
    
def effective_time_ms(s: Solve):
    if s.penalty == "DNF":
        return None
    if s.time_ms is None:
        return None
    if s.penalty == "+2":
        return s.time_ms + 2000
    return s.time_ms

# Dashboard API
# GET /api/dashboard/summary?range=30d
@dashboard_bp.route("/dashboard/summary", methods=["GET"])
@require_auth
def summary():
    """
    Returns:
        counts: {solves, dnf, plus2}
        timeStats: {bestMs, worstMs, avgMs, ao5Ms, ao12Ms}
        scoreStats: {avgScore, bestScore}
        trend.daily: [{date, avgMs, avgScore, count}, ...]    
    """
    user = request.current_user

    range_str = request.args.get("range", "30d")
    days = parse_range(range_str)

    since = datetime.utcnow() - timedelta(days=days)

    solves = (Solve.query
                .filter(Solve.user_id == user.id)
                .filter(Solve.created_at >= since)
                .order_by(Solve.created_at.desc(), Solve.id.desc())
                .all())
    
    counts = {
        "solves": len(solves),
        "dnf": sum(1 for s in solves if s.penalty == "DNF"),
        "plus2": sum(1 for s in solves if s.penalty == "+2"),
    }

    times = [effective_time_ms(s) for s in solves if effective_time_ms(s) is not None]

    def avg_int(arr):
        if not arr:
            return None
        return sum(arr) // len(arr)
    
    def ao5(arr):
        if len(arr) < 5:
            return None
        w = sorted(arr[:5])
        return sum(w[1:-1]) // 3
    
    def ao12(arr):
        if len(arr) < 12:
            return None
        w = sorted(arr[:12])
        return sum(w[1:-1]) // 8
    
    timeStats = {
        "bestMs": min(times) if times else None,
        "worstMs": max(times) if times else None,
        "avgMs": avg_int(times),
        "ao5Ms": ao5(times),
        "ao12Ms": ao12(times),
    }

    scores = [float(s.ml_score) for s in solves if s.ml_score is not None]
    scoreStats = {
        "avgScore": sum(scores) / len(scores) if scores else None,
        "bestScore": max(scores) if scores else None,
    }

    # Daily trend buckets
    by_day = {}
    for s in solves:
        day = s.created_at.date().isoformat()
        by_day.setdefault(day, {"times": [], "scores": [], "count": 0})

        by_day[day]["count"] += 1

        t = effective_time_ms(s)
        if t is not None:
            by_day[day]["times"].append(t)

        if s.ml_score is not None:
            by_day[day]["scores"].append(float(s.ml_score))

    daily = []
    for day in sorted(by_day.keys()):
        bucket = by_day[day]
        daily.append({
            "date": day,
            "avgMs": avg_int(bucket["times"]),
            "avgScore": (sum(bucket["scores"]) / len(bucket["scores"])
                         if bucket["scores"] else None),
            "count": bucket["count"],
        })

    return jsonify({
        "range": range_str,
        "counts": counts,
        "timeStats": timeStats,
        "scoreStats": scoreStats,
        "trend": {"daily": daily},
    }), 200