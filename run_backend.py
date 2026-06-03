#!/usr/bin/env python
"""Run the FastAPI backend for production (API + built frontend)."""
import os

import uvicorn

from utils.env_loader import load_env

os.chdir(os.path.dirname(os.path.abspath(__file__)))

if __name__ == "__main__":
    load_env()
    host = os.environ.get("HOST", "0.0.0.0")
    port = int(os.environ.get("PORT", "8000"))
    uvicorn.run(
        "main:app",
        host=host,
        port=port,
        reload=False,
        log_level="info",
    )
