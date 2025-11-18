from datetime import datetime, timezone
from db import db

## Defines User model in table
class User(db.Model):
    __tablename__ = "users"
    id = db.Column(db.Integer, primary_key=True)
    email = db.Column(db.String(120), unique=True, nullable=False)
    password_hash = db.Column(db.String(128), nullable=False)
    created_at = db.Column(db.DateTime, default=datetime.utcnow)
    solves = db.relationship("Solve", backref="user", lazy=True)


## Defines Solve model in table
class Solve(db.Model):
    __tablename__ = "solves"
    id = db.Column(db.Integer, primary_key=True)
    user_id = db.Column(db.Integer, db.ForeignKey("users.id"), nullable=False)
    state = db.Column(db.String(54), nullable=False)
    solution_moves = db.Column(db.Text, nullable=False)
    num_moves = db.Column(db.Integer, nullable=False)
    source = db.Column(db.String(50), nullable=False, default="manual")
    created_at = db.Column(db.DateTime, default=datetime.utcnow)
