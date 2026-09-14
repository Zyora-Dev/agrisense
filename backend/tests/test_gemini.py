import asyncio
import json
from datetime import datetime, timezone
from types import SimpleNamespace
from unittest.mock import AsyncMock
from uuid import uuid4

import pytest
from fastapi import HTTPException
from fastapi.testclient import TestClient
from pydantic import SecretStr

import gemini
from analysis import FarmAnalysisSnapshot, ModelResult
from database import get_db
from main import app
from security import get_current_user


def snapshot(farm_id, simulated: bool = True) -> FarmAnalysisSnapshot:
    return FarmAnalysisSnapshot(
        farm_id=farm_id,
        generated_at=datetime(2026, 9, 14, tzinfo=timezone.utc),
        input_status="incomplete",
        inputs=[],
        missing_metrics=["nitrogen"],
        stale_metrics=[],
        contains_simulated_data=simulated,
        model=ModelResult(
            status="not_ready",
            model_version="test-v1",
            scope="test",
            reason="Missing required model inputs.",
            required_metrics=["nitrogen"],
            missing_metrics=["nitrogen"],
            stale_metrics=[],
            uses_simulated_data=simulated,
            predictions=[],
        ),
    )


def request_client():
    user = SimpleNamespace(id=uuid4())

    async def override_get_db():
        yield AsyncMock()

    app.dependency_overrides[get_db] = override_get_db
    app.dependency_overrides[get_current_user] = lambda: user
    return user


def clear_overrides() -> None:
    app.dependency_overrides.pop(get_db, None)
    app.dependency_overrides.pop(get_current_user, None)


def test_recommendations_parse_structured_response_and_label_simulated_data(monkeypatch) -> None:
    farm_id = uuid4()
    user = request_client()
    farm = SimpleNamespace(
        id=farm_id, name="North Field", location="Nagercoil", area_hectares=None,
        soil_type="loamy", detected_soil_type=None,
    )
    monkeypatch.setattr(
        gemini,
        "load_analysis_snapshot",
        AsyncMock(return_value=(farm, snapshot(farm_id))),
    )
    generate = AsyncMock(return_value=json.dumps({
        "summary": "Collect the missing nutrient reading before changing inputs.",
        "recommendations": [{
            "priority": "high",
            "title": "Measure nitrogen",
            "action": "Collect a representative soil sample.",
            "reason": "The crop model is missing nitrogen.",
            "precaution": "Do not apply fertilizer from this incomplete snapshot.",
        }],
        "follow_up_measurements": ["nitrogen"],
    }))
    monkeypatch.setattr(gemini, "generate_content", generate)
    try:
        with TestClient(app) as client:
            response = client.get(f"/farms/{farm_id}/recommendations")
    finally:
        clear_overrides()

    assert response.status_code == 200
    assert response.json()["model"] == "gemini-3.6-flash"
    assert response.json()["uses_simulated_data"] is True
    assert response.json()["recommendations"][0]["priority"] == "high"
    assert "AI-generated" in response.json()["disclaimer"]
    assert generate.await_args.args[2]["type"] == "object"
    assert str(farm_id) in generate.await_args.args[0][0]["parts"][0]["text"]
    assert user.id is not None


def test_chat_maps_assistant_history_to_gemini_model_role(monkeypatch) -> None:
    farm_id = uuid4()
    request_client()
    farm = SimpleNamespace(
        id=farm_id, name="North Field", location="Nagercoil", area_hectares=None,
        soil_type="loamy", detected_soil_type=None,
    )
    monkeypatch.setattr(
        gemini,
        "load_analysis_snapshot",
        AsyncMock(return_value=(farm, snapshot(farm_id, simulated=False))),
    )
    generate = AsyncMock(return_value="Measure soil moisture before irrigating.")
    monkeypatch.setattr(gemini, "generate_content", generate)
    try:
        with TestClient(app) as client:
            response = client.post(f"/farms/{farm_id}/chat", json={
                "message": "Should I irrigate now?",
                "history": [
                    {"role": "user", "text": "What data is missing?"},
                    {"role": "assistant", "text": "Nitrogen is missing."},
                ],
            })
    finally:
        clear_overrides()

    assert response.status_code == 200
    assert response.json()["answer"] == "Measure soil moisture before irrigating."
    assert response.json()["uses_simulated_data"] is False
    contents = generate.await_args.args[0]
    assert [item["role"] for item in contents] == ["user", "model", "user"]
    assert contents[-1]["parts"][0]["text"] == "Should I irrigate now?"


def test_chat_rejects_empty_message() -> None:
    farm_id = uuid4()
    request_client()
    try:
        with TestClient(app) as client:
            response = client.post(f"/farms/{farm_id}/chat", json={"message": "  "})
    finally:
        clear_overrides()

    assert response.status_code == 422


def test_image_context_is_bounded_and_farm_scoped() -> None:
    farm_id = uuid4()
    farm = SimpleNamespace(name="Field", location="Nagercoil", area_hectares=None,
                           soil_type=None, detected_soil_type=None)
    image = gemini.ImageObservation(
        farm_id=farm_id, captured_at=datetime.now(timezone.utc), source="upload",
        classifier_version="mobilenetv3-plant-disease-a100-v1",
        detector_version="yolo-plantdoc-v1",
        classifications=[{"label": "Tomato healthy", "confidence": 0.8}],
    )
    context = json.loads(gemini.analysis_context(farm, snapshot(farm_id), image))
    assert context["image_observation"]["classifications"][0]["confidence"] == 0.8
    assert "not server-verified" in context["image_limitations"]
    import pytest
    from fastapi import HTTPException
    from pydantic import ValidationError
    with pytest.raises(HTTPException) as error:
        gemini.analysis_context(farm, snapshot(uuid4()), image)
    assert error.value.status_code == 422
    with pytest.raises(ValidationError):
        gemini.ImagePrediction(label="Tomato", confidence=1.5)


def test_image_reaches_recommendations_and_chat(monkeypatch) -> None:
    farm_id = uuid4()
    request_client()
    farm = SimpleNamespace(name="Field", location="Nagercoil", area_hectares=None,
                           soil_type=None, detected_soil_type=None)
    monkeypatch.setattr(gemini, "load_analysis_snapshot",
                        AsyncMock(return_value=(farm, snapshot(farm_id))))
    generate = AsyncMock(return_value=json.dumps({
        "summary": "Inspect the leaf.", "recommendations": [{
            "priority": "medium", "title": "Inspect", "action": "Check both leaf surfaces.",
            "reason": "Image results are uncertain.", "precaution": "Do not spray yet.",
        }], "follow_up_measurements": [],
    }))
    monkeypatch.setattr(gemini, "generate_content", generate)
    image = {
        "farm_id": str(farm_id), "captured_at": "2026-09-14T05:00:00Z", "source": "camera",
        "classifier_version": "mobilenetv3-plant-disease-a100-v1",
        "detector_version": "yolo-plantdoc-v1",
        "classifications": [{"label": "Tomato Early blight", "confidence": 0.7}],
        "detections": [],
    }
    try:
        with TestClient(app) as client:
            response = client.post(f"/farms/{farm_id}/recommendations", json={"image": image})
            assert response.status_code == 200
            assert "Tomato Early blight" in generate.await_args.args[0][0]["parts"][0]["text"]
            generate.return_value = "Verify the suspected leaf symptoms."
            response = client.post(f"/farms/{farm_id}/chat", json={"message": "What next?", "image": image})
            assert response.status_code == 200
            assert "Tomato Early blight" in generate.await_args.args[1]
            image["farm_id"] = str(uuid4())
            response = client.post(f"/farms/{farm_id}/chat", json={"message": "What next?", "image": image})
            assert response.status_code == 422
    finally:
        clear_overrides()


@pytest.mark.parametrize("finish_reason", ["MAX_TOKENS", "SAFETY", "STOP"])
def test_generation_rejects_incomplete_responses_and_joins_answer_parts(monkeypatch, finish_reason) -> None:
    response = SimpleNamespace(
        raise_for_status=lambda: None,
        json=lambda: {"candidates": [{"finishReason": finish_reason, "content": {"parts": [
            {"text": "Private reasoning", "thought": True},
            {"text": "Measure "}, {"text": "soil moisture."},
        ]}}]},
    )
    client = AsyncMock()
    client.post.return_value = response
    client.__aenter__.return_value = client
    monkeypatch.setattr(gemini.httpx, "AsyncClient", lambda **kwargs: client)
    monkeypatch.setattr(gemini.settings, "gemini_api_key", SecretStr("test-key"))
    if finish_reason == "STOP":
        assert asyncio.run(gemini.generate_content([], "test")) == "Measure soil moisture."
    else:
        with pytest.raises(HTTPException) as error:
            asyncio.run(gemini.generate_content([], "test"))
        assert error.value.status_code == 503
    assert client.post.await_args.kwargs["json"]["generationConfig"]["maxOutputTokens"] == 8192