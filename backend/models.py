from datetime import datetime, timezone
from db import db
from sqlalchemy.dialects.postgresql import JSONB


# Defines User model in table
class User(db.Model):
    __tablename__ = "users"
    id = db.Column(db.Integer, primary_key=True)
    email = db.Column(db.String(120), unique=True, nullable=False)
    name = db.Column(db.String(100), nullable=False)
    password_hash = db.Column(db.String(128), nullable=False)
    created_at = db.Column(db.DateTime, default=datetime.utcnow)
    solves = db.relationship("Solve", backref="user", lazy=True)
    wca_id = db.Column(db.String(100), nullable=True)
    wca_333_avg_ms = db.Column(db.Integer, nullable=True)
    wca_333_single_ms = db.Column(db.Integer, nullable=True)
    self_reported_333_avg_ms = db.Column(db.Integer, nullable=True)
    skill_source = db.Column(db.String(100), nullable=True, default="unknown")
    wca_last_fetched_at = db.Column(db.DateTime(timezone=True), nullable=True)
    solves_since_retrain = db.Column(db.String(100), nullable=False, default="0")
    last_retrain_at = db.Column(db.DateTime(timezone=True), nullable=True)
    active_model_version = db.Column(db.String(100), nullable=False, default="global_v2")

    def get_skill_prior_ms(self) -> int | None:
        """
        Returns the best available estimate of the user's 3x3 average in milliseconds.
        This is the number you'll feed into ML as a "skill prior" feature.
        """
        if self.skill_source == "wca" and self.wca_333_avg_ms:
            return self.wca_333_avg_ms
        if self.skill_source == "self_reported" and self.self_reported_333_avg_ms:
            return self.self_reported_333_avg_ms
        # fallback: if fields exist but source wasn't set properly
        return self.wca_333_avg_ms or self.self_reported_333_avg_ms


# Defines Solve model in table
class Solve(db.Model):
    __tablename__ = "solves"
    id = db.Column(db.BigInteger, primary_key=True)

    user_id = db.Column(db.Integer, db.ForeignKey("users.id"), nullable=False)

    scramble = db.Column(db.Text, nullable=False)
    time_ms = db.Column(db.Integer, nullable=True)
    penalty = db.Column(db.String(10), nullable=False, default="OK")
    notes = db.Column(db.Text, nullable=True)
    tags = db.Column(db.ARRAY(db.Text), nullable=True)

    state = db.Column(db.Text, nullable=True)
    solution_moves = db.Column(db.Text, nullable=True)
    num_moves = db.Column(db.Integer, nullable=True)

    ml_score = db.Column(db.Float, nullable=True)
    score_version = db.Column(db.String(50), nullable=True)

    source = db.Column(db.String(50), nullable=False, default="timer")
    event = db.Column(db.String(20), nullable=False, default="3x3")

    created_at = db.Column(db.DateTime, default=datetime.utcnow)
    expected_time_ms = db.Column(db.Integer, nullable=True)
    dnf_risk = db.Column(db.Float, nullable=True)
    plus2_risk = db.Column(db.Float, nullable=True)


class MLRetrainJob(db.Model):
    """
    Represents a request to retrain models for a specific user.
    We store these in the DB so retraining can happen safely OUTSIDE of Flask requests.
    """
    __tablename__ = "ml_retrain_jobs"

    id = db.Column(db.BigInteger, primary_key=True)
    user_id = db.Column(db.Integer, db.ForeignKey("users.id"), nullable=False)

    status = db.Column(db.String(20), nullable=False, default="queued")

    requested_at = db.Column(db.DateTime(timezone=True), nullable=False, default=lambda: datetime.now(timezone.utc))
    started_at = db.Column(db.DateTime(timezone=True), nullable=True)
    finished_at = db.Column(db.DateTime(timezone=True), nullable=True)

    trigger_solve_id = db.Column(db.BigInteger, nullable=True)

    error = db.Column(db.Text, nullable=True)

    new_model_version = db.Column(db.String(100), nullable=True)

class DashboardSnapshot(db.Model):
    __tablename__ = "dashboard_snapshots"

    id = db.Column(db.BigInteger, primary_key=True)

    user_id = db.Column(db.Integer, db.ForeignKey("users.id"), nullable=False)
    range_days = db.Column(db.Integer, nullable=False)

    data = db.Column(JSONB, nullable=False)
    updated_at = db.Column(db.DateTime, nullable=False, default=datetime.utcnow)

    __table_args__ = (
        db.UniqueConstraint("user_id", "range_days", name="uq_dashboard_snapshot_user_range"),
    )

