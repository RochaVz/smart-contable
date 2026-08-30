import asyncio
from unittest.mock import Mock

from fastapi import HTTPException

import app.main as main
from app.main import health, readiness


class AvailableDatabase:
    def execute(self, _query):
        return None


class UnavailableDatabase:
    def execute(self, _query):
        raise ConnectionError("database unavailable")


def test_health_reports_process_liveness_without_database():
    assert health() == {"status": "ok"}


def test_readiness_reports_database_connectivity():
    assert readiness(AvailableDatabase()) == {
        "status": "ok",
        "database": "conectada",
    }


def test_readiness_returns_503_when_database_is_unavailable():
    try:
        readiness(UnavailableDatabase())
    except HTTPException as exc:
        assert exc.status_code == 503
        assert exc.detail == "Base de datos no disponible"
    else:
        raise AssertionError("Expected readiness to raise HTTPException")


def test_production_startup_does_not_create_database_schema(monkeypatch):
    create_all = Mock()
    monkeypatch.setattr(main.settings, "ENVIRONMENT", "production")
    monkeypatch.setattr(main.Base.metadata, "create_all", create_all)

    async def start_and_stop_application():
        async with main.lifespan(main.app):
            pass

    asyncio.run(start_and_stop_application())

    create_all.assert_not_called()