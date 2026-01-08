# Rubik’s Cube Training and Analytics Platform

A full-stack Rubik’s Cube training and analytics platform that allows users to time solves, generate scrambles, compute optimal solutions, analyze performance trends, and score solves using heuristic and machine learning–based models.

This project was built as an end-to-end software engineering and machine learning learning exercise, integrating frontend UI/UX, backend APIs, database persistence, and model training/inference into a single cohesive system.

---

## Overview

The Rubik’s Cube Project is designed to replicate and extend the workflow of competitive speedcubers in a web-based environment. Users can generate scrambles, time their solves directly in the browser, store results persistently, and view detailed statistics over time.

In addition to traditional timing features, the platform computes cube solutions programmatically and assigns a normalized performance score to each solve, with a roadmap toward a fully trained Gradient Boosted Machine (GBM) model.

---

## Key Features

### Solve Timing and Scramble Generation
- In-browser solve timer with state transitions (idle, ready, running, stopped)
- Automatic scramble generation for 3x3 solves
- Support for penalties such as +2 and DNF
- Persistent solve storage tied to authenticated users

### Solve History and Analytics
- Full solve history view with editing and deletion support
- Live session statistics during timing
- Aggregated long-term statistics on a dashboard
- Personal best tracking and rolling averages

### Automatic Solution Computation
- Cube state and scramble processing
- Optimal or near-optimal solution generation using a two-phase solving algorithm
- Solution data stored alongside each solve for analysis and future extensions

### Authentication and Persistence
- JWT-based authentication
- Per-user data isolation
- Database-backed persistence using SQLAlchemy
- Designed to work with Supabase Postgres or any compatible SQL database

### Solve Scoring and Machine Learning
- Baseline heuristic scoring system producing a normalized score
- Machine learning pipeline under development using Gradient Boosted Models
- Score versioning to track heuristic vs ML-based evaluations
- Modular training and inference architecture

---

## Tech Stack

### Frontend
- React
- TypeScript
- TailwindCSS
- Vite

### Backend
- Python
- Flask
- Flask-CORS
- SQLAlchemy
- JWT authentication

### Database
- Supabase Postgres (recommended)
- Compatible with standard PostgreSQL or MySQL setups

### Machine Learning
- NumPy
- Pandas
- scikit-learn
- Gradient boosting framework (planned / optional)

---

## System Architecture

1. The frontend requests or generates a scramble.
2. The user completes a timed solve in the browser.
3. Solve data is submitted to the backend via REST APIs.
4. The backend persists the solve and optionally:
   - Computes an optimal solution
   - Computes a heuristic or ML-based score
5. Aggregated statistics are returned to the frontend for visualization.

---

## Local Setup

### Prerequisites
- Python 3.10 or newer
- Node.js 18 or newer
- PostgreSQL database (local or Supabase)

---
### Backend Setup

Navigate to backend directory:
```bash
cd backend
```

Create and activate virtual environment:
```bash
# Create virtual environment
python -m venv .venv

# Activate on Windows
.venv\Scripts\activate

# Activate on macOS/Linux
source .venv/bin/activate
```

Install dependencies:
```bash
pip install -r requirements.txt
```

Configure environment variables by creating a `.env` file inside `backend/`:
```env
FLASK_ENV=development
SECRET_KEY=your_secret_key

SQLALCHEMY_DATABASE_URI=postgresql+psycopg2://USER:PASSWORD@HOST:PORT/DBNAME
JWT_SECRET=your_jwt_secret

CORS_ORIGINS=http://localhost:5173
```

Run the backend server:
```bash
python app.py
```

Backend will be available at: http://localhost:5000

### Frontend Setup

Navigate to frontend directory:
```bash
cd frontend
```

Install dependencies:
```bash
npm install
```

Run development server:
```bash
npm run dev
```

Frontend will be available at: http://localhost:5173

Optional: Configure API base URL by creating `.env` in `frontend/`:
```env
VITE_API_BASE_URL=http://localhost:5000/api
```

## API Documentation

### Authentication Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | /api/auth/register | Register new user |
| POST | /api/auth/login | Login user |
| GET | /api/auth/me | Get current user info |

### Solves Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | /api/solves | Create new solve |
| GET | /api/solves | Get all solves for user |
| PATCH | /api/solves/:id | Update solve |
| DELETE | /api/solves/:id | Delete solve |
| POST | /api/solves/:id/score | Calculate ML score for solve |

### Cube Utilities

- Scramble generation
- Solution computation from cube state

## Machine Learning Pipeline

### Current Implementation

- Heuristic-based scoring using solve time, penalties, and user baselines
- Scores normalized to a consistent scale (0-1000)
- Stored with version metadata for reproducibility

### Planned Extensions

- Dataset generation from historical solves
- Gradient Boosted Model (GBM) training
- Advanced feature engineering:
  - Solve statistics and rolling averages
  - Time-of-day patterns
  - User performance trends
- Model versioning and reproducible inference
- Real-time score predictions

## Tech Stack

### Backend

- Flask - Web framework
- SQLAlchemy - ORM
- PostgreSQL - Database
- JWT - Authentication
- scikit-learn - Machine learning
- pandas/numpy - Data processing

### Frontend

- React - UI framework
- Vite - Build tool

### ML/Analytics

- joblib - Model serialization
- matplotlib/seaborn - Visualization
- scipy - Scientific computing

## Known Issues and Debugging

- Ensure SQLALCHEMY_DATABASE_URI is set before running training or backend scripts
- Run backend commands from the correct working directory to avoid import errors
- Configure CORS correctly to allow frontend-backend communication during development

## Roadmap

- Improved 3D cube visualization
- Session-based analytics and statistics
- Fully deployed ML scoring model with real-time predictions
- WCA profile integration
- Production deployment with Docker
- CI/CD pipeline setup
- Advanced performance forecasting
- Personalized training recommendations

## Dependencies

Full list of Python dependencies in requirements.txt:
```
aiomysql==0.3.2
aiosqlite==0.21.0
annotated-doc==0.0.3
annotated-types==0.7.0
anyio==4.11.0
argon2-cffi==23.1.0
argon2-cffi-bindings==25.1.0
arrow==1.3.0
asttokens==3.0.0
async-lru==2.0.5
attrs==25.3.0
babel==2.17.0
bcrypt==4.3.0
beautifulsoup4==4.13.5
bleach==6.2.0
blinker==1.9.0
cachetools==6.2.1
certifi==2025.8.3
cffi==2.0.0
charset-normalizer==3.4.3
click==8.3.0
colorama==0.4.6
comm==0.2.3
contourpy==1.3.3
cryptography==46.0.3
cycler==0.12.1
debugpy==1.8.17
decorator==5.2.1
defusedxml==0.7.1
distro==1.9.0
dnspython==2.8.0
email-validator==2.3.0
executing==2.2.1
fastapi==0.121.0
fastapi-users==15.0.1
fastapi-users-db-sqlalchemy==7.0.0
fastjsonschema==2.21.2
Flask==3.1.2
flask-cors==6.0.1
Flask-SQLAlchemy==3.1.1
fonttools==4.60.0
fqdn==1.5.1
future==0.16.0
google-ai-generativelanguage==0.6.15
google-api-core==2.28.1
google-api-python-client==2.185.0
google-auth==2.42.0
google-auth-httplib2==0.2.0
google-generativeai==0.8.5
googleapis-common-protos==1.71.0
greenlet==3.2.4
grpcio==1.76.0
grpcio-status==1.71.2
h11==0.16.0
httpcore==1.0.9
httplib2==0.31.0
httptools==0.6.4
httpx==0.28.1
idna==3.10
imagekitio==4.2.0
ipykernel==6.30.1
ipython==9.5.0
ipython_pygments_lexers==1.1.1
isoduration==20.11.0
itsdangerous==2.2.0
jedi==0.19.2
Jinja2==3.1.6
jiter==0.11.0
joblib==1.5.2
json5==0.12.1
jsonpointer==3.0.0
jsonschema==4.25.1
jsonschema-specifications==2025.9.1
jupyter-events==0.12.0
jupyter-lsp==2.3.0
jupyter_client==8.6.3
jupyter_core==5.8.1
jupyter_server==2.17.0
jupyter_server_terminals==0.5.3
jupyterlab==4.4.8
jupyterlab_pygments==0.3.0
jupyterlab_server==2.27.3
kiwisolver==1.4.9
kociemba==1.2.1
lark==1.3.0
makefun==1.16.0
MarkupSafe==3.0.2
matplotlib==3.10.6
matplotlib-inline==0.1.7
mistune==3.1.4
mpmath==1.3.0
nbclient==0.10.2
nbconvert==7.16.6
nbformat==5.10.4
nest-asyncio==1.6.0
notebook==7.4.5
notebook_shim==0.2.4
numpy==2.3.3
openai==1.109.1
packaging==25.0
pandas==2.3.2
pandocfilters==1.5.1
parso==0.8.5
pillow==11.3.0
platformdirs==4.4.0
prometheus_client==0.23.1
prompt_toolkit==3.0.52
proto-plus==1.26.1
protobuf==5.29.5
psutil==7.1.0
psycopg2-binary==2.9.11
pure_eval==0.2.3
pwdlib==0.2.1
pyasn1==0.6.1
pyasn1_modules==0.4.2
pycparser==2.23
pycuber==0.2.2
pydantic==2.11.9
pydantic_core==2.33.2
Pygments==2.19.2
PyJWT==2.10.1
pymongo==4.15.3
PyMySQL==1.1.2
pyparsing==3.2.5
python-dateutil==2.9.0.post0
python-dotenv==1.1.1
python-json-logger==3.3.0
python-multipart==0.0.20
pytz==2025.2
pywin32==311
pywinpty==3.0.0
PyYAML==6.0.2
pyzmq==27.1.0
referencing==0.36.2
requests==2.32.5
requests-toolbelt==1.0.0
rfc3339-validator==0.1.4
rfc3986-validator==0.1.1
rfc3987-syntax==1.1.0
rpds-py==0.27.1
rsa==4.9.1
rubik-cube==0.0.2
scikit-learn==1.7.2
scipy==1.16.2
seaborn==0.13.2
Send2Trash==1.8.3
setuptools==80.9.0
six==1.17.0
sniffio==1.3.1
soupsieve==2.8
SQLAlchemy==2.0.44
stack-data==0.6.3
starlette==0.48.0
sympy==1.14.0
terminado==0.18.1
threadpoolctl==3.6.0
tinycss2==1.4.0
tornado==6.5.2
tqdm==4.67.1
traitlets==5.14.3
types-python-dateutil==2.9.0.20250822
typing-inspection==0.4.1
typing_extensions==4.15.0
tzdata==2025.2
uri-template==1.3.0
uritemplate==4.2.0
urllib3==2.5.0
uvicorn==0.37.0
watchfiles==1.1.0
wcwidth==0.2.14
webcolors==24.11.1
webencodings==0.5.1
websocket-client==1.8.0
websockets==15.0.1
Werkzeug==3.1.3
wheel==0.45.1
windows-curses==2.4.1
```

## License

No license specified.

## Contributing

Contributions are welcome! Please feel free to submit a Pull Request.
