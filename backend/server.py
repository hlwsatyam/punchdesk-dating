"""Entrypoint for supervisor / uvicorn -- delegates to app.main.create_app()."""
from app.main import create_app

app = create_app()
