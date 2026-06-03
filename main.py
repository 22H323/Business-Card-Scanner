import os

from utils.env_loader import load_env

load_env()

# Limit OpenBLAS, MKL, and OMP threads at startup to help manage memory use
os.environ["OPENBLAS_NUM_THREADS"] = "1"
os.environ["MKL_NUM_THREADS"] = "1"
os.environ["OMP_NUM_THREADS"] = "1"

import logging
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse, Response
from contextlib import asynccontextmanager
from pathlib import Path

# Set up logging early so any imports that log will output consistently
logging.basicConfig(level=logging.INFO, format="%(asctime)s - %(name)s - %(levelname)s - %(message)s")
logger = logging.getLogger(__name__)

# Application imports come after logging config, so we don't miss any logs
from api.routes import router
from api.lead_routes import router as lead_router
from services.whatsapp_service import whatsapp_queue
from services.email_service import email_queue

@asynccontextmanager
async def lifespan(app: FastAPI):
    # Start background queues/services when the app launches, and shut them down on exit
    await whatsapp_queue.start()
    await email_queue.start()
    yield
    await whatsapp_queue.stop()
    await email_queue.stop()

app = FastAPI(
    title="CardSync AI API",
    description=(
        "Business card OCR, local PostgreSQL contact storage, and Zoho CRM integration.\n\n"
        "**Swagger UI:** `/docs` · **ReDoc:** `/redoc` · **OpenAPI JSON:** `/openapi.json`"
    ),
    version="1.0.0",
    lifespan=lifespan,
    docs_url="/docs",
    redoc_url="/redoc",
    openapi_url="/openapi.json",
    openapi_tags=[
        {"name": "Health", "description": "Service health and connectivity checks"},
        {"name": "OCR", "description": "Scan business card images and extract contact fields"},
        {"name": "Contacts", "description": "Local DB contact CRUD, duplicates, and Zoho sync"},
        {"name": "Leads", "description": "Zoho CRM leads API"},
        {"name": "Integrations", "description": "WhatsApp and email queue integrations"},
        {"name": "Admin", "description": "Destructive admin operations (wipe data)"},
    ],
)

def _normalize_origin(origin: str) -> str:
    """Browsers send Origin without a path (e.g. /scan); strip trailing slashes from config."""
    return origin.strip().rstrip("/")


# Netlify production site (covers /scan, /contacts, and all client routes)
NETLIFY_FRONTEND_ORIGIN = "https://businesscardscannertesting.netlify.app"

allowed_origins = [
    "http://localhost:5173",
    "http://127.0.0.1:5173",
    "http://localhost:5174",
    "http://127.0.0.1:5174",
    "http://localhost:4173",
    "http://127.0.0.1:4173",
    "http://localhost:3000",
    "http://127.0.0.1:3000",
    "http://localhost:3001",
    "http://127.0.0.1:3001",
    NETLIFY_FRONTEND_ORIGIN,
]

# Local dev + Netlify deploy previews (branch URLs like name--site.netlify.app)
cors_origin_regex = (
    r"https?://(localhost|127\.0\.0\.1)(:\d+)?|"
    r"https://([a-zA-Z0-9-]+--)?[a-zA-Z0-9-]+\.netlify\.app"
)

frontend_url = os.getenv("FRONTEND_URL")
if frontend_url:
    allowed_origins.append(_normalize_origin(frontend_url))

allowed_origins_str = os.getenv("ALLOWED_ORIGINS")
if allowed_origins_str:
    allowed_origins.extend(
        _normalize_origin(origin)
        for origin in allowed_origins_str.split(",")
        if origin.strip()
    )

allowed_origins = list({_normalize_origin(origin) for origin in allowed_origins})
logger.info("CORS allowed origins: %s", ", ".join(sorted(allowed_origins)))

# CORS must be added after `app` is created. Do not combine allow_origins=["*"]
# with allow_credentials=True — browsers reject that and show a CORS error.
app.add_middleware(
    CORSMiddleware,
    allow_origins=allowed_origins,
    allow_origin_regex=cors_origin_regex,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(router)
app.include_router(lead_router)


@app.get("/health", tags=["Health"], summary="Health check")
def health_check():
    from services.zoho_service import refresh_access_token

    zoho_connected = False
    zoho_error = None
    try:
        token_data = refresh_access_token()
        zoho_connected = bool(token_data.get("access_token"))
    except Exception as exc:
        zoho_error = str(exc)

    from services.contact_storage import storage_label
    from services.contact_storage import check_storage as check_contact_storage

    payload = {
        "ok": True,
        "service": "cardsync-backend",
        "storage": storage_label(),
        "database": check_contact_storage(),
        "zoho": {"connected": zoho_connected},
    }
    if zoho_error:
        payload["zoho"]["error"] = zoho_error
    return payload

# If the frontend static build exists, serve it directly from here
dist_path = Path(__file__).parent / "dist" / "client"
if dist_path.exists():
    app.mount("/assets", StaticFiles(directory=str(dist_path / "assets")), name="assets")
    
    @app.get("/")
    async def serve_frontend():
        """Send the main index.html of the frontend when users hit the root"""
        index_path = dist_path / "index.html"
        if index_path.exists():
            with open(index_path, 'r', encoding='utf-8') as f:
                content = f.read()
            return Response(content=content, media_type="text/html")
        return {"error": "Frontend not found"}, 404
    
    @app.get("/{full_path:path}")
    async def serve_spa_routes(full_path: str):
        """Handle client-side routes for a single-page app, but let API calls and special paths fall through."""
        skip_prefixes = [
            "api/",
            "admin/",
            "docs",
            "redoc",
            "openapi.json",
            "health",
            "contacts",
            "scan-card",
            "integrations",
            ".well-known",
        ]
        if any(full_path.startswith(p) for p in skip_prefixes):
            return None
        
        # Try to send the file if it exists (like for assets)
        file_path = dist_path / full_path
        if file_path.is_file() and file_path.exists():
            return FileResponse(file_path)
        
        # Otherwise, serve index.html (SPA fallback - lets React Router, etc. work)
        index_path = dist_path / "index.html"
        if index_path.exists():
            with open(index_path, 'r', encoding='utf-8') as f:
                content = f.read()
            return Response(content=content, media_type="text/html")
        
        return {"error": "Not found"}, 404
