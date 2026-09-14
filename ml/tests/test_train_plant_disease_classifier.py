from pathlib import Path

import numpy as np
from PIL import Image

from ml.train_plant_disease_classifier import (
    audit_samples,
    classification_metrics,
    discover_images,
    stratified_group_split,
)


def test_discovery_audit_and_split_keep_duplicate_groups_together(tmp_path: Path) -> None:
    for class_offset, class_name in enumerate(("healthy", "rust")):
        class_dir = tmp_path / class_name
        class_dir.mkdir()
        for index in range(10):
            color_index = 0 if index == 9 else index
            Image.new(
                "RGB",
                (16, 16),
                color=(color_index * 20, class_offset * 120, 20),
            ).save(
                class_dir / f"{index}.jpg"
            )

    classes, discovered = discover_images(tmp_path)
    audited, report = audit_samples(discovered)
    splits = stratified_group_split(audited, seed=7)

    assert classes == ["healthy", "rust"]
    assert report["valid_images"] == 20
    digest_splits: dict[str, set[str]] = {}
    for split_name, samples in splits.items():
        for _, _, digest in samples:
            digest_splits.setdefault(digest, set()).add(split_name)
    assert all(len(names) == 1 for names in digest_splits.values())


def test_classification_metrics() -> None:
    metrics = classification_metrics(
        np.asarray([0, 1, 2]),
        np.asarray([[0.9, 0.05, 0.05], [0.1, 0.7, 0.2], [0.2, 0.1, 0.7]]),
        ["a", "b", "c"],
    )

    assert metrics["accuracy"] == 1.0
    assert metrics["top_3_accuracy"] == 1.0
    assert metrics["macro_f1"] == 1.0