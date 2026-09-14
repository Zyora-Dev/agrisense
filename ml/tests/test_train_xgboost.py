import csv
import json
import sys
from pathlib import Path

import numpy as np
import pytest


sys.path.insert(0, str(Path(__file__).parents[1]))

from train_xgboost import FEATURES, load_dataset, stratified_split, train


def write_dataset(path: Path, rows_per_class: int = 10) -> None:
    with path.open("w", newline="", encoding="utf-8") as dataset_file:
        writer = csv.writer(dataset_file)
        writer.writerow([*FEATURES, "label"])
        for class_index, label in enumerate(("crop_a", "crop_b", "crop_c")):
            for row_index in range(rows_per_class):
                base = class_index * 100 + row_index
                writer.writerow([base + offset for offset in range(len(FEATURES))] + [label])


def test_load_dataset_rejects_wrong_schema(tmp_path: Path) -> None:
    dataset = tmp_path / "invalid.csv"
    dataset.write_text("N,P,label\n1,2,rice\n", encoding="utf-8")

    with pytest.raises(ValueError, match="Expected columns"):
        load_dataset(dataset)


def test_stratified_split_is_reproducible_and_preserves_classes() -> None:
    labels = np.asarray([label for label in ("a", "b", "c") for _ in range(10)])

    first = stratified_split(labels, seed=26180)
    second = stratified_split(labels, seed=26180)

    assert all(np.array_equal(left, right) for left, right in zip(first, second, strict=True))
    assert [len(indices) for indices in first] == [18, 6, 6]
    assert all(set(labels[indices]) == {"a", "b", "c"} for indices in first)


def test_train_writes_model_and_metadata(tmp_path: Path) -> None:
    dataset = tmp_path / "dataset.csv"
    output = tmp_path / "artifacts"
    write_dataset(dataset)

    metadata = train(dataset, output, seed=26180, rounds=5)

    assert (output / "model.ubj").is_file()
    assert (output / "evaluation_history.json").is_file()
    saved_metadata = json.loads((output / "metadata.json").read_text(encoding="utf-8"))
    assert saved_metadata["dataset"]["rows"] == 30
    assert saved_metadata["classes"] == ["crop_a", "crop_b", "crop_c"]
    assert saved_metadata["split_rows"] == {"train": 18, "validation": 6, "test": 6}
    assert 0 <= metadata["metrics"]["accuracy"] <= 1
    assert metadata["scope"].startswith("Crop suitability classification only")