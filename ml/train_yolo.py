from __future__ import annotations

import argparse
import csv
import json
import shutil
from datetime import UTC, datetime
from pathlib import Path

import torch
from ultralytics import YOLO, __version__ as ultralytics_version


def numeric_results(results: dict[str, object]) -> dict[str, float]:
    return {
        key: float(value)
        for key, value in results.items()
        if isinstance(value, (int, float))
    }


def read_training_history(path: Path) -> list[dict[str, float]]:
    if not path.is_file():
        return []
    with path.open(newline="", encoding="utf-8") as results_file:
        return [
            {key.strip(): float(value) for key, value in row.items() if value != ""}
            for row in csv.DictReader(results_file)
        ]


def train(
    data: Path,
    base_model: Path,
    output_dir: Path,
    epochs: int,
    image_size: int,
    batch: int,
    device: str,
    patience: int,
    seed: int,
) -> dict[str, object]:
    output_dir.parent.mkdir(parents=True, exist_ok=True)
    model = YOLO(str(base_model))
    model.train(
        data=str(data),
        epochs=epochs,
        imgsz=image_size,
        batch=batch,
        device=device,
        workers=0,
        seed=seed,
        deterministic=True,
        patience=patience,
        project=str(output_dir.parent.resolve()),
        name=output_dir.name,
        exist_ok=True,
        plots=True,
        verbose=False,
    )

    best_model_path = output_dir / "weights" / "best.pt"
    if not best_model_path.is_file():
        raise RuntimeError(f"Training did not produce {best_model_path}")
    best_model = YOLO(str(best_model_path))
    test_results = best_model.val(
        data=str(data),
        split="test",
        imgsz=image_size,
        batch=batch,
        device=device,
        workers=0,
        plots=True,
        project=str(output_dir.resolve()),
        name="test-evaluation",
        exist_ok=True,
        verbose=False,
    )

    exported_model: str | None = None
    try:
        export_path = Path(
            best_model.export(
                format="onnx",
                imgsz=image_size,
                dynamic=True,
                simplify=True,
                device="cpu",
            )
        )
        destination = output_dir / "best.onnx"
        if export_path.resolve() != destination.resolve():
            shutil.move(export_path, destination)
        exported_model = str(destination)
    except Exception as exc:
        export_error = str(exc)
    else:
        export_error = None

    history = read_training_history(output_dir / "results.csv")
    best_validation = (
        max(history, key=lambda row: row["metrics/mAP50-95(B)"]) if history else None
    )
    metadata: dict[str, object] = {
        "model_type": "yolo11n_plantdoc_object_detection",
        "trained_at": datetime.now(UTC).isoformat(),
        "data": str(data),
        "base_model": str(base_model),
        "best_model": str(best_model_path),
        "onnx_model": exported_model,
        "onnx_export_error": export_error,
        "versions": {
            "ultralytics": ultralytics_version,
            "torch": torch.__version__,
        },
        "parameters": {
            "epochs": epochs,
            "image_size": image_size,
            "batch": batch,
            "device": device,
            "patience": patience,
            "seed": seed,
        },
        "epochs_completed": len(history),
        "validation_best": best_validation,
        "validation_final": history[-1] if history else None,
        "test_metrics": numeric_results(test_results.results_dict),
        "test_scope": "Official PlantDoc TEST split after exact train-side duplicate removal; the split has no Potato leaf or Tomato two spotted spider mites leaf annotations.",
    }
    (output_dir / "metadata.json").write_text(
        json.dumps(metadata, indent=2) + "\n", encoding="utf-8"
    )
    return metadata


def main() -> None:
    parser = argparse.ArgumentParser(description="Train and evaluate AgriSense PlantDoc YOLO.")
    parser.add_argument("--data", type=Path, required=True)
    parser.add_argument("--base-model", type=Path, required=True)
    parser.add_argument("--output", type=Path, required=True)
    parser.add_argument("--epochs", type=int, default=50)
    parser.add_argument("--image-size", type=int, default=512)
    parser.add_argument("--batch", type=int, default=4)
    parser.add_argument("--device", default="mps")
    parser.add_argument("--patience", type=int, default=10)
    parser.add_argument("--seed", type=int, default=26180)
    arguments = parser.parse_args()
    metadata = train(
        arguments.data,
        arguments.base_model,
        arguments.output,
        arguments.epochs,
        arguments.image_size,
        arguments.batch,
        arguments.device,
        arguments.patience,
        arguments.seed,
    )
    print(json.dumps(metadata, indent=2))


if __name__ == "__main__":
    main()