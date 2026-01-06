from __future__ import annotations

import os
import random
from datetime import datetime, timedelta, timezone

from dotenv import load_dotenv
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

from models import Solve, User  # adjust if your import path differs

load_dotenv()

MOVES = ["R", "L", "U", "D", "F", "B"]
MODS = ["", "'", "2"]

def random_scramble(length: int = 20) -> str:
    """
    Generates a 'reasonable' scramble string.
    Not guaranteed WCA-perfect, but avoids repeating same face twice in a row.
    """
    out = []
    last_face = None
    for _ in range(length):
        face = random.choice(MOVES)
        while face == last_face:
            face = random.choice(MOVES)
        last_face = face
        out.append(face + random.choice(MODS))
    return " ".join(out)

def clamp(x: float, lo: float, hi: float) -> float:
    return max(lo, min(hi, x))

def main():
    db_url = os.environ.get("SQLALCHEMY_DATABASE_URI")
    if not db_url:
        raise RuntimeError("Set SQLALCHEMY_DATABASE_URI in your env/.env")

    # ---- CONFIG YOU CARE ABOUT ----
    TARGET_USER_ID = int(os.environ.get("SYNTH_USER_ID", "2"))  # change or set env var
    N = int(os.environ.get("SYNTH_N", "2500"))

    # Your WCA anchors (seconds)
    WCA_AVG_S = float(os.environ.get("SYNTH_WCA_AVG_S", "30.83"))
    WCA_SINGLE_S = float(os.environ.get("SYNTH_WCA_SINGLE_S", "28.02"))

    # Time distribution knobs
    BASE_STD_S = float(os.environ.get("SYNTH_STD_S", "3.2"))  # typical variability

    # Penalty rates
    P_DNF = float(os.environ.get("SYNTH_P_DNF", "0.015"))  # 1.5%
    P_PLUS2 = float(os.environ.get("SYNTH_P_PLUS2", "0.07"))  # 7%
    # remainder is OK

    # Spread over days
    DAYS = int(os.environ.get("SYNTH_DAYS", "30"))
    # --------------------------------

    engine = create_engine(db_url)
    Session = sessionmaker(bind=engine)
    session = Session()

    user = session.query(User).filter(User.id == TARGET_USER_ID).first()
    if not user:
        raise RuntimeError(f"User id {TARGET_USER_ID} not found")

    now = datetime.now(timezone.utc)
    start = now - timedelta(days=DAYS)

    rows = []
    for i in range(N):
        # create a timestamp spread across the range
        # slightly more recent density
        t = random.random() ** 0.6
        created_at = start + (now - start) * t

        # penalty
        r = random.random()
        if r < P_DNF:
            penalty = "DNF"
        elif r < P_DNF + P_PLUS2:
            penalty = "+2"
        else:
            penalty = "OK"

        # moves: typical 3x3 solutions ~ 50-75 in beginner-ish metrics
        # We'll generate around 60 with some noise.
        num_moves = int(round(random.gauss(60, 6)))
        num_moves = int(clamp(num_moves, 40, 90))

        # time model:
        # base time around WCA avg, plus:
        # - a little effect from moves
        # - occasional "hot streak" and "bad day" outliers
        base = random.gauss(WCA_AVG_S, BASE_STD_S)

        # weak correlation: +0.05s per move above 60 (and negative if below)
        base += 0.05 * (num_moves - 60)

        # occasional very good solves (closer to single) and very bad solves
        u = random.random()
        if u < 0.06:
            # good solve: pull toward single
            base = random.gauss(WCA_SINGLE_S + 0.6, 1.0)
        elif u > 0.97:
            # bad solve/outlier
            base = random.gauss(WCA_AVG_S + 10.0, 4.0)

        # clamp to realistic bounds
        base = clamp(base, 8.0, 120.0)

        time_ms = int(round(base * 1000))

        s = Solve(
            user_id=user.id,
            scramble=random_scramble(20),
            time_ms=time_ms,
            penalty=penalty,
            notes=None,
            tags=None,
            state=None,
            solution_moves=None,
            num_moves=num_moves,
            ml_score=None,
            score_version=None,
            source="timer",
            event="3x3",
            created_at=created_at.replace(tzinfo=None),  # your model uses naive utcnow; keep consistent
        )

        rows.append(s)

    session.bulk_save_objects(rows)
    session.commit()

    print(f"Inserted {N} synthetic solves for user_id={TARGET_USER_ID}")

if __name__ == "__main__":
    main()