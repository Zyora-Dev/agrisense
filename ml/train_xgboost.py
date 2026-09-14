from __future__ import annotations

import argparse
import csv
import hashlib
import json
from collections import Counter
from datetime import UTC, datetime
from pathlib import Path

import numpy as np
import xgboost as xgb


FEATURES = ("N", "P", "K", "temperature", "humidity", "ph", "rainfall")
TARGET = "label"
EXPECTED_COLUMNS = (*FEATURES, TARGET)


def load_dataset(path: Path) -> tuple[np.ndarray, np.ndarray]:
    with path.open(newline="", encoding="utf-8") as dataset_file:
        reader = csv.DictReader(dataset_file)
        if tuple(reader.fieldnames or ()) != EXPECTED_COLUMNS:
            raise ValueError(f"Expected columns {EXPECTED_COLUMNS}, got {reader.fieldnames}")

        rows = list(reader)

    if not rows:
        raise ValueError("Dataset is empty")
    if any(any(row[column].strip() == "" for column in EXPECTED_COLUMNS) for row in rows):
        raise ValueError("Dataset contains missing values")

    features = np.asarray(
        [[float(row[column]) for column in FEATURES] for row in rows], dtype=np.float32
    )
    labels = np.asarray([row[TARGET].strip() for row in rows])
    if not np.isfinite(features).all():
        raise ValueError("Dataset contains non-finite feature values")
    return features, labels


def stratified_split(
    labels: np.ndarray, seed: int
) -> tuple[np.ndarray, np.ndarray, np.ndarray]:
    rng = np.random.default_rng(seed)
    train_indices: list[int] = []
    validation_indices: list[int] = []
    test_indices: list[int] = []

    for label in sorted(set(labels.tolist())):
        class_indices = np.flatnonzero(labels == label)
        if len(class_indices) < 5:
            raise ValueError(f"Class {label!r} has too few rows for a three-way split")
        rng.shuffle(class_indices)
        test_count = max(1, round(len(class_indices) * 0.15))
        validation_count = max(1, round(len(class_indices) * 0.15))
        test_indices.extend(class_indices[:test_count])
        validation_indices.extend(class_indices[test_count : test_count + validation_count])
        train_indices.extend(class_indices[test_count + validation_count :])

    for indices in (train_indices, validation_indices, test_indices):
        rng.shuffle(indices)
    return (
        np.asarray(train_indices, dtype=np.int64),
        np.asarray(validation_indices, dtype=np.int64),
        np.asarray(test_indices, dtype=np.int64),
    )


def classification_metrics(
    actual: np.ndarray, probabilities: np.ndarray, classes: list[str]
) -> dict[str, object]:
    predicted = probabilities.argmax(axis=1)
    top_three = np.argsort(probabilities, axis=1)[:, -3:]
    per_class: dict[str, dict[str, float | int]] = {}

    for class_index, class_name in enumerate(classes):
        true_positive = int(np.sum((actual == class_index) & (predicted == class_index)))
        false_positive = int(np.sum((actual != class_index) & (predicted == class_index)))
        false_negative = int(np.sum((actual == class_index) & (predicted != class_index)))
        precision = true_positive / (true_positive + false_positive) if true_positive + false_positive else 0.0
        recall = true_positive / (true_positive + false_negative) if true_positive + false_negative else 0.0
        f1 = 2 * precision * recall / (precision + recall) if precision + recall else 0.0
        per_class[class_name] = {
            "support": int(np.sum(actual == class_index)),
            "precision": precision,
            "recall": recall,
            "f1": f1,
        }

    return {
        "accuracy": float(np.mean(predicted == actual)),
        "top_3_accuracy": float(np.mean(np.any(top_three == actual[:, None], axis=1))),
        "macro_f1": float(np.mean([values["f1"] for values in per_class.values()])),
        "log_loss": float(-np.mean(np.log(np.clip(probabilities[np.arange(len(actual)), actual], 1e-15, 1.0)))),
        "per_class": per_class,
    }


def sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as source_file:
        for chunk in iter(lambda: source_file.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def train(dataset_path: Path, output_dir: Path, seed: int, rounds: int) -> dict[str, object]:
    features, labels = load_dataset(dataset_path)
    classes = sorted(set(labels.tolist()))
    class_to_index = {label: index for index, label in enumerate(classes)}
    encoded_labels = np.asarray([class_to_index[label] for label in labels], dtype=np.int32)
    train_indices, validation_indices, test_indices = stratified_split(labels, seed)

    parameters = {
        "objective": "multi:softprob",
        "num_class": len(classes),
        "eval_metric": ["mlogloss", "merror"],
        "max_depth": 6,
        "eta": 0.05,
        "subsample": 0.85,
        "colsample_bytree": 0.9,
        "min_child_weight": 1,
        "seed": seed,
        "nthread": 0,
    }
    train_matrix = xgb.DMatrix(features[train_indices], label=encoded_labels[train_indices], feature_names=list(FEATURES))
    validation_matrix = xgb.DMatrix(features[validation_indices], label=encoded_labels[validation_indices], feature_names=list(FEATURES))
    test_matrix = xgb.DMatrix(features[test_indices], label=encoded_labels[test_indices], feature_names=list(FEATURES))
    evaluation_history: dict[str, dict[str, list[float]]] = {}
    model = xgb.train(
        parameters,
        train_matrix,
        num_boost_round=rounds,
        evals=[(train_matrix, "train"), (validation_matrix, "validation")],
        early_stopping_rounds=max(10, min(30, rounds // 5)),
        evals_result=evaluation_history,
        verbose_eval=False,
    )

    output_dir.mkdir(parents=True, exist_ok=True)
    model_path = output_dir / "model.ubj"
    model.save_model(model_path)
    probabilities = model.predict(test_matrix, iteration_range=(0, model.best_iteration + 1))
    metrics = classification_metrics(encoded_labels[test_indices], probabilities, classes)
    metadata: dict[str, object] = {
        "model_type": "xgboost_crop_suitability",
        "trained_at": datetime.now(UTC).isoformat(),
        "dataset": {
            "path": str(dataset_path),
            "sha256": sha256(dataset_path),
            "rows": len(labels),
            "class_counts": dict(sorted(Counter(labels.tolist()).items())),
        },
        "features": list(FEATURES),
        "classes": classes,
        "seed": seed,
        "split_rows": {
            "train": len(train_indices),
            "validation": len(validation_indices),
            "test": len(test_indices),
        },
        "parameters": parameters,
        "rounds_requested": rounds,
        "best_iteration": model.best_iteration,
        "metrics": metrics,
        "feature_importance_gain": model.get_score(importance_type="gain"),
        "scope": "Crop suitability classification only; not irrigation, drought, yield, or disease prediction.",
    }
    (output_dir / "metadata.json").write_text(json.dumps(metadata, indent=2) + "\n", encoding="utf-8")
    (output_dir / "evaluation_history.json").write_text(
        json.dumps(evaluation_history, indent=2) + "\n", encoding="utf-8"
    )
    return metadata


def main() -> None:
    parser = argparse.ArgumentParser(description="Train the AgriSense crop-suitability XGBoost model.")
    parser.add_argument("--dataset", type=Path, required=True)
    parser.add_argument("--output", type=Path, required=True)
    parser.add_argument("--seed", type=int, default=26180)
    parser.add_argument("--rounds", type=int, default=500)
    arguments = parser.parse_args()
    metadata = train(arguments.dataset, arguments.output, arguments.seed, arguments.rounds)
    print(json.dumps(metadata["metrics"], indent=2))


if __name__ == "__main__":
    main()