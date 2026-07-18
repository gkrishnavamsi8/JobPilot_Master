"""FastAPI application entry point.

Run locally:
    .venv/bin/uvicorn server.main:app --reload --port 8000
"""

from __future__ import annotations

import logging
import os
from contextlib import asynccontextmanager

from dotenv import load_dotenv
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from .db import ensure_schema
from .routes import router as api_router
from .store import build_store, reset_store

load_dotenv()

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s %(levelname)s %(name)s: %(message)s",
    datefmt="%H:%M:%S",
)
log = logging.getLogger("jobpilot.api")


@asynccontextmanager
async def lifespan(app: FastAPI):
    log.info("startup: verifying storage backend")
    try:
        # Build once so config errors surface immediately in logs; details go
        # to /api/health if the health check itself fails at runtime.
        build_store()
        ensure_schema()
    except Exception:
        log.exception(
            "startup: storage backend not usable yet - API is still up so "
            "/api/health can report the exact error"
        )
    yield
    log.info("shutdown: releasing store")
    reset_store()


app = FastAPI(
    title="jobpilot API",
    version="0.1.0",
    lifespan=lifespan,
)


origins = os.getenv("CORS_ORIGINS", "http://localhost:5173,http://127.0.0.1:5173")
app.add_middleware(
    CORSMiddleware,
    allow_origins=[o.strip() for o in origins.split(",") if o.strip()],
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(api_router)


@app.get("/")
def root() -> dict:
    return {"service": "jobpilot", "docs": "/docs", "api": "/api/health"}


__all__ = ["app"]
