from dotenv import load_dotenv
import os

load_dotenv()

class Config:
    SQLALCHEMY_DATABASE_URI = os.getenv("SQLALCHEMY_DATABASE_URI")
    JWT_SECRET_KEY = os.getenv("JWT_SECRET_KEY")
    SQLALCHEMY_TRACK_MODIFICATIONS = False

    WCA_API_BASE_URL = os.getenv(
        "WCA_API_BASE_URL",
        "https://raw.githubusercontent.com/robiningelbrecht/wca-rest-api/master"
    )
