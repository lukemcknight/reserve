import os

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.api import tax
from app.utils.constants import DISCLAIMER

app = FastAPI(title="NIL Tax Reserve Prototype", version="0.1.0")

# Allow callers from the SPA (local dev + deployed). Configure additional origins with
# ALLOWED_ORIGINS="https://myapp.com,https://www.myapp.com".
allowed_origins = [
    origin.strip()
    for origin in os.getenv("ALLOWED_ORIGINS", "").split(",")
    if origin.strip()
]
if not allowed_origins:
    # Default to permissive CORS since this is a public, unauthenticated API.
    allowed_origins = ["*"]

app.add_middleware(
    CORSMiddleware,
    allow_origins=allowed_origins,
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Namespace API routes under /api for future growth.
app.include_router(tax.router, prefix="/api")


@app.get("/health")
def health() -> dict[str, str]:
    # Lightweight readiness check; avoids extra dependencies.
    return {"status": "ok", "disclaimer": DISCLAIMER}
