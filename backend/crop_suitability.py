from __future__ import annotations

import json
from dataclasses import dataclass
from pathlib import Path

import numpy as np
import xgboost as xgb


ARTIFACT_DIR = Path(__file__).resolve().parents[1] / "ml" / "artifacts" / "xgboost-crop-suitability-v1"
EXPECTED_FEATURES = ("N", "P", "K", "temperature", "humidity", "ph", "rainfall")


@dataclass(frozen=True)
class RankedCrop:
    crop: str
    confidence: float


class CropSuitabilityPredictor:
    def __init__(self, artifact_dir: Path = ARTIFACT_DIR) -> None:
        metadata = json.loads((artifact_dir / "metadata.json").read_text(encoding="utf-8"))
        if tuple(metadata.get("features", ())) != EXPECTED_FEATURES:
            raise ValueError("Crop-suitability artifact has an incompatible feature schema")
        classes = metadata.get("classes")
        if not isinstance(classes, list) or not classes:
            raise ValueError("Crop-suitability artifact has no class labels")

        self.classes = tuple(str(label) for label in classes)
        self.version = str(metadata["trained_at"])
        self.scope = str(metadata["scope"])
        self.model = xgb.Booster()
        self.model.load_model(artifact_dir / "model.ubj")

    def predict(
        self,
        *,
        nitrogen: float,
        phosphorus: float,
        potassium: float,
        temperature: float,
        humidity: float,
        ph: float,
        rainfall: float,
    ) -> list[RankedCrop]:
        values = np.asarray([[
            nitrogen, phosphorus, potassium, temperature, humidity, ph, rainfall,
        ]], dtype=np.float32)
        if not np.isfinite(values).all():
            raise ValueError("Crop-suitability inputs must be finite")

        matrix = xgb.DMatrix(values, feature_names=list(EXPECTED_FEATURES))
        probabilities = self.model.predict(matrix)[0]
        ranked_indices = np.argsort(probabilities)[::-1][:3]
        return [
            RankedCrop(crop=self.classes[index], confidence=float(probabilities[index]))
            for index in ranked_indices
        ]