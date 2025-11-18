# create_tables.py
from app import create_app
from db import db
import models  # this makes sure User and Solve are registered

app = create_app()

with app.app_context():
    db.create_all()
    print("Tables created.")
