import json
from types import SimpleNamespace
from unittest.mock import AsyncMock, MagicMock
from uuid import uuid4

import pytest
from fastapi.testclient import TestClient

import marketplace
from database import get_db
from main import app
from security import get_current_user
from test_gemini import snapshot


@pytest.mark.parametrize("identifier", [str(marketplace.DEMO_VENDORS[2].products[0].id), "invented-product"])
def test_matches_only_return_existing_catalog_products(monkeypatch, identifier):
    farm_id = uuid4()
    session = AsyncMock()
    session.scalars.return_value = MagicMock(all=lambda: [])
    async def database():
        yield session
    app.dependency_overrides[get_db] = database
    app.dependency_overrides[get_current_user] = lambda: SimpleNamespace(id=uuid4())
    farm = SimpleNamespace(name="Test Farm", location="Nagercoil", area_hectares=None, soil_type="loamy", detected_soil_type=None)
    monkeypatch.setattr(marketplace, "load_analysis_snapshot", AsyncMock(return_value=(farm, snapshot(farm_id))))
    generate = AsyncMock(return_value=json.dumps({"summary":"Test soil first; readings are simulated.", "matches":[{"product_id":identifier,"reason":"Collect a soil sample.","precaution":"Demo only; confirm laboratory requirements."}]}))
    monkeypatch.setattr(marketplace, "generate_content", generate)
    try:
        with TestClient(app) as client:
            response = client.post(f"/marketplace/farms/{farm_id}/recommendations", json={})
        if identifier == "invented-product":
            assert response.status_code == 503
        else:
            assert response.status_code == 200
            assert response.json()["uses_simulated_data"] is True
            assert response.json()["matches"][0]["vendor"]["is_demo"] is True
            assert response.json()["matches"][0]["product"]["id"] == identifier
            assert '"recorded_soil_type":"loamy"' in generate.await_args.args[0][0]["parts"][0]["text"]
    finally:
        app.dependency_overrides.clear()


def test_five_demo_vendors_have_distinct_categories_and_no_real_contacts():
    assert len(marketplace.DEMO_VENDORS) == 5
    assert len({vendor.products[0].category for vendor in marketplace.DEMO_VENDORS}) == 5
    assert all(vendor.is_demo and not vendor.phone and not vendor.contact_email for vendor in marketplace.DEMO_VENDORS)


def test_marketplace_requires_authentication():
    with TestClient(app) as client:
        assert client.get("/marketplace/vendors").status_code == 401
        assert client.post("/marketplace/vendors", json={}).status_code == 401