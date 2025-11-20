from flask import Blueprint, request, jsonify
from db import db
from models import Solve
from auth import require_auth
from collections import Counter
from rubik.cube import Cube
from rubik.solve import Solver

solves_bp = Blueprint("solves", __name__)

# Known-good state from the library’s docs
TEST_STATE = "OOOOOOOOOYYYWWWGGGBBBYYYWWWGGGBBBYYYWWWGGGBBBRRRRRRRRR"


def validate_cube_state_basic(state: str):
    """
    Very basic validation for rubik-cube:
      - must be 54 characters
      - must use exactly 6 different characters
      - each character appears exactly 9 times
    Returns: (ok: bool, error_message_or_None)
    """
    if len(state) != 54:
        return False, "state must be exactly 54 characters"

    counts = Counter(state)
    if len(counts) != 6:
        return False, f"state must use exactly 6 different colors (found {len(counts)})"

    bad = {c: n for c, n in counts.items() if n != 9}
    if bad:
        return False, f"each color must appear exactly 9 times (bad counts: {bad})"

    return True, None


def serialize_solve(solve: Solve):
    return {
        "id": solve.id,
        "state": solve.state,
        "moves": solve.solution_moves,
        "numMoves": solve.num_moves,
        "source": solve.source,
        "createdAt": solve.created_at.isoformat()
    }


def validate_cube_state(state: str):
    """
    Very basic validation for rubik-cube:
      - must be 54 characters
      - must use exactly 6 different characters
      - each character appears exactly 9 times
    Returns: (ok: bool, error_message_or_None)
    """
    if len(state) != 54:
        return False, "state must be exactly 54 characters"

    unique = set(state)
    if len(unique) != 6:
        return False, f"state must use exactly 6 distinct characters, found {len(unique)}"

    from collections import Counter
    counts = Counter(state)
    bad = {ch: cnt for ch, cnt in counts.items() if cnt != 9}
    if bad:
        return False, f"each color must appear exactly 9 times, bad counts: {bad}"

    return True, None


@solves_bp.route("/solve", methods=["POST"])
@require_auth
def create_solve():
    user = request.current_user
    data = request.get_json() or {}

    state = data.get("state")
    source = data.get("source", "manual")

    if not state:
        return jsonify({"error": "state is required"}), 400

    # ✅ backend-side validation
    ok, msg = validate_cube_state_basic(state)
    if not ok:
        return jsonify({"error": msg}), 400

    # ✅ use the real state from frontend (no more test override)
    try:
        cube = Cube(state)
        solver = Solver(cube)
        solver.solve()
        moves_list = solver.moves              # e.g. ['R', 'U', "R'", 'U', ...]
    except Exception:
        # Most likely: cube is not physically solvable / wrong layout
        return jsonify({
            "error": "This cube configuration cannot be solved. "
                     "Make sure it comes from a real scramble, not random colors."
        }), 400

    moves_str = " ".join(moves_list)
    num_moves = len(moves_list)

    solve = Solve(
        user_id=user.id,
        state=state,
        solution_moves=moves_str,
        num_moves=num_moves,
        source=source,
    )

    db.session.add(solve)
    db.session.commit()

    return jsonify(serialize_solve(solve)), 201
@solves_bp.route("/solves", methods=["GET"])
@require_auth
def list_solves():
    user = request.current_user
    solves = Solve.query.filter_by(user_id=user.id).order_by(Solve.created_at.desc()).all()
    return jsonify([serialize_solve(s) for s in solves])