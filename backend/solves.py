from flask import Blueprint, request, jsonify
from datetime import datetime
from collections import Counter
import random
import base64

from dashboard import refresh_dashboard_snapshot
from ml.inference.scorer import score_solve_gbm
from ml.inference.scorer_v2 import score_solve_profile_v2
from db import db
from models import Solve, User, MLRetrainJob
from auth import require_auth
import pycuber as pc

# Kociemba is a fast 2-phase Rubik's Cube solver.
# It expects a 54-character cube string in "facelet" form (URFDLB order),
# with each face given row-major, and each sticker a single character.
import kociemba


solves_bp = Blueprint("solves", __name__)

# Legal moves used to generate random scrambles.
MOVES = ["R", "L", "U", "D", "F", "B"]
MODS = ["", "'", "2"]


@solves_bp.route("/ping", methods=["GET"])
def ping():
    """Simple health check route for debugging."""
    return {"ok": True}


# ----------------------------
# SCRAMBLE GENERATION
# ----------------------------
def generate_scramble_3x3(length: int = 20) -> str:
    """
    Generate a random scramble string of the given length.
    NOTE: This is a simple generator that avoids repeating the same face twice in a row.
    It does not enforce WCA scramble rules beyond that.
    """
    scramble = []
    prev_move = None

    for _ in range(length):
        move = random.choice(MOVES)
        while move == prev_move:
            move = random.choice(MOVES)
        mod = random.choice(MODS)
        scramble.append(move + mod)
        prev_move = move

    return " ".join(scramble)


# ----------------------------
# CURSOR PAGINATION HELPERS
# ----------------------------
def encode_cursor(dt: datetime, solve_id: int) -> str:
    """
    Encode the last item's (created_at, id) into a base64 cursor so the client can ask
    for the next page without using offset pagination.
    """
    raw = f"{dt.isoformat()}|{solve_id}".encode("utf-8")
    return base64.urlsafe_b64encode(raw).decode("utf-8")


def decode_cursor(cursor: str):
    """
    Decode a cursor back into (created_at_datetime, solve_id_int).
    """
    raw = base64.urlsafe_b64decode(cursor.encode("utf-8")).decode("utf-8")
    iso, sid = raw.split("|")
    return datetime.fromisoformat(iso), int(sid)


# ----------------------------
# CUBE STATE VALIDATION
# ----------------------------
def validate_cube_state_basic(state: str):
    """
    Basic checks for a 3x3 cube facelet string:
      - Must be exactly 54 characters
      - Must use exactly 6 distinct characters
      - Each distinct character must appear exactly 9 times

    This does NOT guarantee the cube is physically solvable (parity/orientation).
    Kociemba will reject impossible states during solve().
    """
    if not state or len(state) != 54:
        return False, "state must be exactly 54 characters"

    counts = Counter(state)

    if len(counts) != 6:
        return False, f"state must use exactly 6 different colors (found {len(counts)})"

    bad = {c: n for c, n in counts.items() if n != 9}
    if bad:
        return False, f"each color must appear exactly 9 times (bad counts: {bad})"

    return True, None

def scramble_to_state_urfdlb(scramble: str) -> str:
    """
    Apply a WCA-style scramble to a solved cube (using pycuber),
    then convert to the 54-char URFDLB facelet string that kociemba expects.
    """
    cube = pc.Cube()
    cube(scramble)  # apply scramble

    faces = ["U", "R", "F", "D", "L", "B"]  # URFDLB order

    # Map actual colors -> face letters based on centers (so output is U/R/F/D/L/B)
    center_color_to_face = {}
    for f in faces:
        center = cube.get_face(f)[1][1]
        center_color_to_face[str(center)] = f

    out = []
    for f in faces:
        face = cube.get_face(f)
        for r in range(3):
            for c in range(3):
                color = str(face[r][c])
                out.append(center_color_to_face[color])

    return "".join(out)

# ----------------------------
# SCRAMBLE -> STATE (URFDLB)
# ----------------------------

# Face order / facelet indices match kociemba expectations (URFDLB)
FACES = ["U", "R", "F", "D", "L", "B"]

def _build_facelet_index_maps():
    """
    Build mapping between:
      - facelet index (0..53) <-> (pos, normal) on cube
    pos and normal are integer 3D vectors in {-1,0,1}.
    """
    idx_to_key = {}
    key_to_idx = {}

    def add(face, r, c, x, y, z, nx, ny, nz, idx):
        key = (x, y, z, nx, ny, nz)
        idx_to_key[idx] = key
        key_to_idx[key] = idx

    # U: y=+1, rows z=-1..+1, cols x=-1..+1
    idx = 0
    for r, z in enumerate([-1, 0, 1]):
        for c, x in enumerate([-1, 0, 1]):
            add("U", r, c, x, 1, z, 0, 1, 0, idx)
            idx += 1

    # R: x=+1, rows y=+1..-1, cols z=+1..-1
    for y in [1, 0, -1]:
        for z in [1, 0, -1]:
            add("R", None, None, 1, y, z, 1, 0, 0, idx)
            idx += 1

    # F: z=+1, rows y=+1..-1, cols x=-1..+1
    for y in [1, 0, -1]:
        for x in [-1, 0, 1]:
            add("F", None, None, x, y, 1, 0, 0, 1, idx)
            idx += 1

    # D: y=-1, rows z=+1..-1, cols x=-1..+1
    for z in [1, 0, -1]:
        for x in [-1, 0, 1]:
            add("D", None, None, x, -1, z, 0, -1, 0, idx)
            idx += 1

    # L: x=-1, rows y=+1..-1, cols z=-1..+1
    for y in [1, 0, -1]:
        for z in [-1, 0, 1]:
            add("L", None, None, -1, y, z, -1, 0, 0, idx)
            idx += 1

    # B: z=-1, rows y=+1..-1, cols x=+1..-1
    for y in [1, 0, -1]:
        for x in [1, 0, -1]:
            add("B", None, None, x, y, -1, 0, 0, -1, idx)
            idx += 1

    return idx_to_key, key_to_idx


IDX_TO_KEY, KEY_TO_IDX = _build_facelet_index_maps()

def _rot_y_neg90(v):
    x, y, z = v
    return (z, y, -x)

def _rot_y_pos90(v):
    x, y, z = v
    return (-z, y, x)

def _rot_x_neg90(v):
    x, y, z = v
    return (x, z, -y)

def _rot_x_pos90(v):
    x, y, z = v
    return (x, -z, y)

def _rot_z_neg90(v):
    x, y, z = v
    return (y, -x, z)

def _rot_z_pos90(v):
    x, y, z = v
    return (-y, x, z)

def _apply_move_once(facelets: list[str], move: str) -> list[str]:
    """
    Apply one clockwise face turn (U, D, R, L, F, B) to the facelets.
    Uses 3D rotation of the appropriate layer + remapping indices.
    """
    new_faces = facelets[:]

    def rotate_layer(selector_fn, rot_fn):
        mapping = {}
        for i in range(54):
            x, y, z, nx, ny, nz = IDX_TO_KEY[i]
            if selector_fn(x, y, z, nx, ny, nz):
                px, py, pz = rot_fn((x, y, z))
                nnx, nny, nnz = rot_fn((nx, ny, nz))
                j = KEY_TO_IDX[(px, py, pz, nnx, nny, nnz)]
                mapping[j] = i  # new index j gets old i

        for j, i in mapping.items():
            new_faces[j] = facelets[i]

    if move == "U":
        rotate_layer(lambda x, y, z, nx, ny, nz: y == 1, _rot_y_neg90)
    elif move == "D":
        rotate_layer(lambda x, y, z, nx, ny, nz: y == -1, _rot_y_pos90)
    elif move == "R":
        rotate_layer(lambda x, y, z, nx, ny, nz: x == 1, _rot_x_neg90)
    elif move == "L":
        rotate_layer(lambda x, y, z, nx, ny, nz: x == -1, _rot_x_pos90)
    elif move == "F":
        rotate_layer(lambda x, y, z, nx, ny, nz: z == 1, _rot_z_neg90)
    elif move == "B":
        rotate_layer(lambda x, y, z, nx, ny, nz: z == -1, _rot_z_pos90)
    else:
        raise ValueError(f"unknown move: {move}")

    return new_faces

def scramble_to_state(scramble: str) -> str:
    """
    Convert a scramble string (e.g. "R U R' U'") into a kociemba facelet state string
    in URFDLB order, using letters U,R,F,D,L,B as the 6 colors.
    """
    # solved cube
    facelets = []
    for face in FACES:
        facelets.extend([face] * 9)

    if not scramble:
        return "".join(facelets)

    tokens = scramble.split()
    for tok in tokens:
        base = tok[0]
        suf = tok[1:] if len(tok) > 1 else ""

        turns = 1
        if suf == "2":
            turns = 2
        elif suf == "'":
            turns = 3  # three clockwise turns = one CCW

        for _ in range(turns):
            facelets = _apply_move_once(facelets, base)

    return "".join(facelets)


# ----------------------------
# SERIALIZATION
# ----------------------------
def serialize_solve(s: Solve):
    """
    Convert a Solve SQLAlchemy object into a JSON-friendly dict.
    """
    return {
        "id": s.id,
        "event": s.event,
        "scramble": s.scramble,
        "timeMs": s.time_ms,
        "penalty": s.penalty,
        "notes": s.notes,
        "tags": s.tags,
        "state": s.state,
        "solutionMoves": s.solution_moves,
        "numMoves": s.num_moves,

        "mlScore": s.ml_score,
        "scoreVersion": s.score_version,
        "expectedTimeMs": s.expected_time_ms,
        "dnfRisk": s.dnf_risk,
        "plus2Risk": s.plus2_risk,

        "source": s.source,
        "createdAt": s.created_at.isoformat() if s.created_at else None,
    }


# ----------------------------
# TIME + STATS HELPERS
# ----------------------------
def effective_time_ms(s: Solve):
    """
    Apply penalties to raw time:
      - DNF => None (excluded from averages)
      - +2 => add 2000 ms
      - None => raw time
    """
    if s.penalty == "DNF":
        return None
    if s.time_ms is None:
        return None
    if s.penalty == "+2":
        return s.time_ms + 2000
    return s.time_ms


def compute_live_stats(user_id: int, event: str = "3x3", last_n: int = 200):
    """
    Compute live stats from the user's most recent solves.
    We grab up to last_n solves to keep it fast.
    """
    base = Solve.query.filter_by(user_id=user_id, event=event)

    recent = (
        base.order_by(Solve.created_at.desc(), Solve.id.desc())
        .limit(last_n)
        .all()
    )

    times = []
    scores = []

    for s in recent:
        et = effective_time_ms(s)
        if et is not None:
            times.append(et)
        if s.ml_score is not None:
            scores.append(s.ml_score)

    def avg_int(arr):
        if not arr:
            return None
        return sum(arr) // len(arr)

    def ao5(arr):
        # Standard Ao5: best and worst dropped from 5 solves.
        if len(arr) < 5:
            return None
        w = sorted(arr[:5])
        core = w[1:-1]
        return int(sum(core) / len(core))

    def ao12(arr):
        # Standard Ao12: best and worst dropped from 12 solves.
        if len(arr) < 12:
            return None
        w = sorted(arr[:12])
        core = w[1:-1]
        return int(sum(core) / len(core))

    return {
        "count": base.count(),
        "bestMs": min(times) if times else None,
        "worstMs": max(times) if times else None,
        "ao5Ms": ao5(times),
        "ao12Ms": ao12(times),
        "avgMs": avg_int(times),
        "avgScore": (sum(scores) / len(scores)) if scores else None,
    }


# ----------------------------
# SCORING PLACEHOLDER
# ----------------------------
def heuristic_score(s: Solve) -> float:
    """
    Placeholder scoring function.
    Later you'll replace this with a proper ML model (GBM).
    """
    t = effective_time_ms(s)
    if t is None:
        return 0.0
    return max(0.0, 110.0 - t / 400.0)


# ----------------------------
# API ROUTES
# ----------------------------

# GET /api/scramble?event=3x3
@solves_bp.route("/scramble", methods=["GET"])
@require_auth
def get_scramble():
    """
    Return a new scramble string. For now only 3x3 is supported.
    """
    _user = request.current_user  # forces auth; not used otherwise

    event = request.args.get("event", "3x3")
    if event != "3x3":
        return jsonify({"error": "Only 3x3 supported for now"}), 400

    scr = generate_scramble_3x3()
    state = scramble_to_state_urfdlb(scr)

    return jsonify({"scramble": scr, "event": event, "state": state})




# POST /api/solves
@solves_bp.route("/solves", methods=["POST"])
@require_auth
def create_timed_solve():
    """
    Save a timed solve (from your timer UI).

    Required body fields:
      - scramble
      - timeMs

    Optional:
      - penalty: None | "+2" | "DNF"
      - notes: string
      - tags: array
      - state: 54-char cube string (URFDLB blocks) if you want
      - solutionMoves: array (or string depending on your storage)
      - numMoves: int
      - source: default "timer"

    IMPORTANT DESIGN NOTES (so you learn what's going on):
    - This endpoint ONLY saves the solve.
    - We do NOT retrain ML here (that would block the user and crash your API).
    - We do NOT score here either; scoring happens via POST /api/solves/<id>/score.
      (Frontend calls it right after saving, so UX is still instant.)
    - We enqueue retraining every 50 solves using a DB-backed job queue table.
    """
    user = request.current_user
    data = request.get_json() or {}

    # -----------------------------
    # 1) Parse required fields
    # -----------------------------
    scramble = data.get("scramble")
    time_ms = data.get("timeMs")
    event = data.get("event", "3x3")

    if event != "3x3":
        return jsonify({"error": "Only 3x3 supported for now"}), 400

    if scramble is None:
        return jsonify({"error": "scramble is required"}), 400

    if time_ms is None:
        return jsonify({"error": "timeMs is required"}), 400

    # Ensure timeMs is an integer (ms)
    try:
        time_ms = int(time_ms)
    except (ValueError, TypeError):
        return jsonify({"error": "timeMs must be an integer"}), 400

    # -----------------------------
    # 2) Parse optional fields
    # -----------------------------
    penalty = data.get("penalty")  # None | "+2" | "DNF"
    notes = data.get("notes", "")
    tags = data.get("tags", [])
    state = data.get("state", "")
    solution_moves = data.get("solutionMoves", [])
    num_moves = data.get("numMoves")
    source = data.get("source", "timer")

    # Validate penalty exactly how your backend expects.
    # (This is why frontend must send null for OK.)
    if penalty not in (None, "+2", "DNF"):
        return jsonify({"error": "penalty must be one of None, '+2', 'DNF'"}), 400

    # Only validate state if user provided it ("" means "not provided")
    if state:
        valid, err = validate_cube_state_basic(state)
        if not valid:
            return jsonify({"error": f"Invalid cube state: {err}"}), 400

    # -----------------------------
    # 3) Create solve row
    # -----------------------------
    new_solve = Solve(
        user_id=user.id,
        event=event,
        scramble=scramble,
        time_ms=time_ms,
        penalty=penalty,
        notes=notes,
        tags=tags,
        state=state,

        # Store solution info if you have it
        solution_moves=solution_moves,
        num_moves=num_moves,

        # ML fields start null until scored by /score
        ml_score=None,
        score_version=None,

        # NEW v2 profile fields start null until scored by /score
        expected_time_ms=None,
        dnf_risk=None,
        plus2_risk=None,

        source=source,
        created_at=datetime.utcnow(),
    )

    # -----------------------------
    # 4) Save solve
    # -----------------------------
    db.session.add(new_solve)

    # -----------------------------
    # 5) Retrain trigger logic (every 50 solves)
    # -----------------------------
    # We increment a counter on the user.
    # When it hits 50, we enqueue a background job and reset the counter.
    #
    # IMPORTANT:
    # This does NOT run training here. It only records a job in the DB.
    # A worker script will later pick it up and train safely.
    try:
        user.solves_since_retrain = (user.solves_since_retrain or 0) + 1

        if user.solves_since_retrain >= 50:
            # Create a queued job
            job = MLRetrainJob(
                user_id=user.id,
                status="queued",
                trigger_solve_id=new_solve.id,  # NOTE: id exists after flush/commit; see below
            )

            # To ensure new_solve.id exists before commit, we flush first.
            db.session.flush()  # assigns new_solve.id without committing yet
            job.trigger_solve_id = new_solve.id

            db.session.add(job)

            # Reset counter so next retrain happens after the next 50
            user.solves_since_retrain = 0
    except Exception as e:
        # If retrain enqueue fails for any reason, we still want to save the solve.
        # So we log but do NOT abort the request.
        print("Warning: failed to enqueue retrain job:", e)

    # -----------------------------
    # 6) Commit transaction
    # -----------------------------
    db.session.commit()

    try:
        refresh_dashboard_snapshot(user.id, "30d")
    except Exception as e:
        print("Warning: failed to refresh dashboard snapshot:", e)
    # -----------------------------
    # 7) Return solve + live stats
    # -----------------------------
    return (
        jsonify(
            {
                "success": True,
                "solve": serialize_solve(new_solve),
                "liveStats": compute_live_stats(user.id, event=event),
            }
        ),
        201,
    )


# GET /api/solves/live-stats?event=3x3
@solves_bp.route("/solves/live-stats", methods=["GET"])
@require_auth
def get_live_stats():
    """
    Return current stats computed from the user's most recent solves.
    """
    user = request.current_user
    event = request.args.get("event", "3x3")
    return jsonify(compute_live_stats(user.id, event=event))


# POST /api/solves/from-state
@solves_bp.route("/solves/from-state", methods=["POST"])
@require_auth
def create_solve_from_state():
    """
    Create a solve from a scanned/entered cube state by computing a solution with kociemba.

    Body example:
      {
        "state": "....54 chars....",  # URFDLB blocks
        "source": "manual",
        "event": "3x3",
        "scramble": "...optional...",
        "notes": "...optional..."
      }

    Saves:
      - state
      - solutionMoves (array of moves)
      - numMoves
    """
    user = request.current_user
    data = request.get_json() or {}

    state = data.get("state")
    source = data.get("source", "manual")
    event = data.get("event", "3x3")
    scramble = data.get("scramble", "")
    notes = data.get("notes", "")

    if event != "3x3":
        return jsonify({"error": "Only 3x3 supported for now"}), 400

    if state is None:
        return jsonify({"error": "state is required"}), 400

    valid, err = validate_cube_state_basic(state)
    if not valid:
        return jsonify({"error": f"Invalid cube state: {err}"}), 400

    # Ask kociemba for a (near-optimal) solution.
    # If the cube state is physically impossible, kociemba will throw an exception.
    try:
        solution_str = kociemba.solve(state)
        solution_moves = solution_str.split()
    except Exception:
        return jsonify(
            {
                "error": "This cube configuration cannot be solved. Make sure it comes from a valid scramble."
            }
        ), 400

    solve = Solve(
        user_id=user.id,
        event=event,
        scramble=scramble,
        notes=notes,
        state=state,
        solution_moves=solution_moves,
        num_moves=len(solution_moves),
        source=source,
        created_at=datetime.utcnow(),
    )

    db.session.add(solve)
    db.session.commit()

    return jsonify({"solve": serialize_solve(solve)}), 201

# POST /api/solves/:id/score
@solves_bp.route("/solves/<int:solve_id>/score", methods=["POST"])
@require_auth
def score_solve(solve_id: int):
    user = request.current_user
    solve = Solve.query.filter_by(id=solve_id, user_id=user.id).first()
    if not solve:
        return jsonify({"error": "Solve not found"}), 404

    ml_score, expected_time_ms, dnf_risk, plus2_risk, version = score_solve_profile_v2(db.session, user, solve)

    # Save results on the solve row so frontend can display them later
    solve.ml_score = float(ml_score)
    solve.score_version = version

    solve.expected_time_ms = expected_time_ms
    solve.dnf_risk = dnf_risk
    solve.plus2_risk = plus2_risk

    db.session.commit()
    try:
        refresh_dashboard_snapshot(user.id, "30d")
    except Exception as e:
        print("Warning: failed to refresh dashboard snapshot:", e)

    return jsonify({
        "mlScore": solve.ml_score,
        "scoreVersion": solve.score_version,
        "expectedTimeMs": solve.expected_time_ms,
        "dnfRisk": solve.dnf_risk,
        "plus2Risk": solve.plus2_risk,
    })

# GET /api/solves
@solves_bp.route("/solves", methods=["GET"])
@require_auth
def list_solves():
    """
    List solves for the current user with cursor pagination.

    Query parameters supported:
      limit=50
      cursor=...
      event=3x3
      penalty=OK
      source=timer
      from=2025-12-01T00:00:00
      to=2025-12-15T00:00:00
      hasScore=true
      hasSolution=true
    """
    user = request.current_user
    limit = min(int(request.args.get("limit", 50)), 200)
    cursor = request.args.get("cursor")
    event = request.args.get("event", "3x3")

    q = Solve.query.filter_by(user_id=user.id, event=event)

    penalty = request.args.get("penalty")
    if penalty:
        q = q.filter(Solve.penalty == penalty)

    source = request.args.get("source")
    if source:
        q = q.filter(Solve.source == source)
    has_score = request.args.get("hasScore")
    if has_score in ("true", "True", "1"):
        q = q.filter(Solve.ml_score.isnot(None))

    has_solution = request.args.get("hasSolution")
    if has_solution in ("true", "True", "1"):
        q = q.filter(Solve.solution_moves.isnot(None))

    from_iso = request.args.get("from")
    to_iso = request.args.get("to")
    if from_iso:
        q = q.filter(Solve.created_at >= datetime.fromisoformat(from_iso))
    if to_iso:
        q = q.filter(Solve.created_at <= datetime.fromisoformat(to_iso))

    q = q.order_by(Solve.created_at.desc(), Solve.id.desc())

    if cursor:
        c_dt, c_id = decode_cursor(cursor)
        q = q.filter(
            (Solve.created_at < c_dt) |
            ((Solve.created_at == c_dt) & (Solve.id < c_id))
        )

    items = q.limit(limit + 1).all()

    next_cursor = None
    if len(items) > limit:
        last = items[limit - 1]
        next_cursor = encode_cursor(last.created_at, last.id)
        items = items[:limit]

    return jsonify({
        "items": [serialize_solve(s) for s in items],
        "nextCursor": next_cursor
    })

# GET /api/solves/:id
@solves_bp.route("/solves/<int:solve_id>", methods=["GET"])
@require_auth
def solve_details(solve_id: int):
    user = request.current_user
    solve = Solve.query.filter_by(id=solve_id, user_id=user.id).first()
    if not solve:
        return jsonify({"error": "Solve not found"}), 404
    return jsonify({"solve": serialize_solve(solve)})

# PATCH /api/solves/:id
@solves_bp.route("/solves/<int:solve_id>", methods=["PATCH"])
@require_auth
def edit_solve(solve_id: int):
    user = request.current_user
    solve = Solve.query.filter_by(id=solve_id, user_id=user.id).first()
    if not solve:
        return jsonify({"error": "Solve not found"}), 404

    data = request.get_json() or {}

    # ----------------------------
    # Penalty handling
    # DB stores "OK" (NOT NULL)
    # Frontend may send null for OK
    # ----------------------------
    if "penalty" in data:
        p = data.get("penalty", None)

        if p in (None, "", "OK"):
            solve.penalty = "OK"
        elif p in ("+2", "DNF"):
            solve.penalty = p
        else:
            return jsonify({"error": "Invalid penalty"}), 400

    # ----------------------------
    # Notes handling
    # Save NULL when empty (cleaner)
    # ----------------------------
    if "notes" in data:
        n = data.get("notes")
        if n is None:
            solve.notes = None
        else:
            n = str(n)
            solve.notes = n if n.strip() else None

    try:
        db.session.commit()
    except Exception as e:
        db.session.rollback()
        # log e server-side; don't leak internals to client
        return jsonify({"error": "Failed to update solve"}), 500

    return jsonify({"solve": serialize_solve(solve)})


# DELETE /api/solves/:id
@solves_bp.route("/solves/<int:solve_id>", methods=["DELETE"])
@require_auth
def delete_solve(solve_id: int):
    user = request.current_user
    solve = Solve.query.filter_by(id=solve_id, user_id=user.id).first()
    if not solve:
        return jsonify({"error": "Solve not found"}), 404

    db.session.delete(solve)
    db.session.commit()

    return jsonify({"success": True})

# POST /api/solves/optimal
@solves_bp.route("/solves/optimal", methods=["POST"])
@require_auth
def optimal_solution():
    """
    Compute a kociemba solution for a given cube state WITHOUT saving a solve.

    Body:
      { "state": "<54 chars URFDLB>", "event": "3x3" }

    Returns:
      { "solutionMoves": [...], "numMoves": N }
    """
    _user = request.current_user
    data = request.get_json() or {}

    state = data.get("state")
    event = data.get("event", "3x3")

    if event != "3x3":
        return jsonify({"error": "Only 3x3 supported for now"}), 400
    if state is None:
        return jsonify({"error": "state is required"}), 400

    valid, err = validate_cube_state_basic(state)
    if not valid:
        return jsonify({"error": f"Invalid cube state: {err}"}), 400

    try:
        solution_str = kociemba.solve(state)
        solution_moves = solution_str.split()
    except Exception:
        return jsonify({"error": "This cube configuration cannot be solved."}), 400

    return jsonify({"solutionMoves": solution_moves, "numMoves": len(solution_moves)})

