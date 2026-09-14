import pytest

from crop_suitability import CropSuitabilityPredictor


def test_saved_crop_suitability_artifact_returns_ranked_top_three() -> None:
    predictor = CropSuitabilityPredictor()

    predictions = predictor.predict(
        nitrogen=90,
        phosphorus=42,
        potassium=43,
        temperature=20.9,
        humidity=82.0,
        ph=6.5,
        rainfall=203.0,
    )

    assert len(predictions) == 3
    assert predictions[0].crop == "rice"
    assert all(0 <= prediction.confidence <= 1 for prediction in predictions)
    assert [item.confidence for item in predictions] == sorted(
        [item.confidence for item in predictions], reverse=True
    )
    assert predictor.version
    assert predictor.scope.startswith("Crop suitability classification only")


def test_crop_suitability_rejects_non_finite_inputs() -> None:
    predictor = CropSuitabilityPredictor()

    with pytest.raises(ValueError, match="must be finite"):
        predictor.predict(
            nitrogen=float("nan"),
            phosphorus=42,
            potassium=43,
            temperature=20.9,
            humidity=82.0,
            ph=6.5,
            rainfall=203.0,
        )