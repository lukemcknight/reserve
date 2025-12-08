from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.api import tax
from app.utils.constants import DISCLAIMER

app = FastAPI(title="NIL Tax Reserve Prototype", version="0.1.0")

# Allow local dev callers (Vite defaults to port 5173). OPTIONS is handled by the middleware.
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173", "http://127.0.0.1:5173"],
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
