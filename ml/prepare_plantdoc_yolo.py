from __future__ import annotations

import argparse
import hashlib
import json
import random
import shutil
import xml.etree.ElementTree as ET
from collections import Counter
from dataclasses import dataclass
from datetime import UTC, datetime
from pathlib import Path

from PIL import Image


IMAGE_SUFFIXES = {"JPEG": ".jpg", "PNG": ".png"}


@dataclass(frozen=True)
class Annotation:
    source_image: Path
    source_xml: Path
    width: int
    height: int
    boxes: tuple[tuple[str, float, float, float, float], ...]
    sha256: str

    @property
    def classes(self) -> frozenset[str]:
        return frozenset(box[0] for box in self.boxes)


def file_sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as source:
        for chunk in iter(lambda: source.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def read_annotation(xml_path: Path) -> Annotation:
    root = ET.parse(xml_path).getroot()
    filename = (root.findtext("filename") or "").strip()
    if not filename:
        raise ValueError("missing image filename")
    image_path = xml_path.parent / filename
    if not image_path.is_file():
        raise FileNotFoundError(filename)

    with Image.open(image_path) as image:
        image.verify()
        width, height = image.size
    if width <= 0 or height <= 0:
        raise ValueError("image has invalid dimensions")

    boxes: list[tuple[str, float, float, float, float]] = []
    for obj in root.findall("object"):
        class_name = (obj.findtext("name") or "").strip()
        box = obj.find("bndbox")
        if not class_name or box is None:
            raise ValueError("object is missing a class or bounding box")
        xmin, ymin, xmax, ymax = (
            float(box.findtext(coordinate, "nan"))
            for coordinate in ("xmin", "ymin", "xmax", "ymax")
        )
        xmin = max(0.0, min(xmin, float(width)))
        ymin = max(0.0, min(ymin, float(height)))
        xmax = max(0.0, min(xmax, float(width)))
        ymax = max(0.0, min(ymax, float(height)))
        if xmin >= xmax or ymin >= ymax:
            raise ValueError(f"invalid bounding box {(xmin, ymin, xmax, ymax)}")
        boxes.append((class_name, xmin, ymin, xmax, ymax))
    if not boxes:
        raise ValueError("annotation has no objects")

    return Annotation(
        source_image=image_path,
        source_xml=xml_path,
        width=width,
        height=height,
        boxes=tuple(boxes),
        sha256=file_sha256(image_path),
    )


def load_split(folder: Path) -> tuple[list[Annotation], list[dict[str, str]]]:
    annotations: list[Annotation] = []
    skipped: list[dict[str, str]] = []
    for xml_path in sorted(folder.glob("*.xml"), key=lambda path: path.name.casefold()):
        try:
            annotations.append(read_annotation(xml_path))
        except (ET.ParseError, FileNotFoundError, OSError, ValueError) as exc:
            skipped.append({"xml": xml_path.name, "reason": str(exc)})
    return annotations, skipped


def deduplicate(
    train: list[Annotation], test: list[Annotation]
) -> tuple[list[Annotation], list[dict[str, str]]]:
    test_hashes = {annotation.sha256 for annotation in test}
    seen_train: set[str] = set()
    retained: list[Annotation] = []
    removed: list[dict[str, str]] = []
    for annotation in train:
        if annotation.sha256 in test_hashes:
            removed.append({"image": annotation.source_image.name, "reason": "exact_test_duplicate"})
        elif annotation.sha256 in seen_train:
            removed.append({"image": annotation.source_image.name, "reason": "exact_train_duplicate"})
        else:
            seen_train.add(annotation.sha256)
            retained.append(annotation)
    return retained, removed


def split_train_validation(
    annotations: list[Annotation], validation_fraction: float, seed: int
) -> tuple[list[Annotation], list[Annotation]]:
    if not 0 < validation_fraction < 1:
        raise ValueError("validation_fraction must be between zero and one")
    target = max(1, round(len(annotations) * validation_fraction))
    rng = random.Random(seed)
    candidates = list(annotations)
    rng.shuffle(candidates)
    validation: list[Annotation] = []
    selected: set[Path] = set()
    class_counts = Counter(class_name for item in annotations for class_name in item.classes)
    remaining_counts = class_counts.copy()

    def can_select(item: Annotation) -> bool:
        return all(remaining_counts[class_name] > 1 for class_name in item.classes)

    def select(item: Annotation) -> None:
        validation.append(item)
        selected.add(item.source_xml)
        for class_name in item.classes:
            remaining_counts[class_name] -= 1

    for class_name, count in sorted(class_counts.items(), key=lambda item: (item[1], item[0])):
        options = [
            item
            for item in candidates
            if item.source_xml not in selected and class_name in item.classes and can_select(item)
        ]
        if count > 1 and options and len(validation) < target:
            choice = max(options, key=lambda item: len(item.classes))
            select(choice)

    for item in candidates:
        if len(validation) >= target:
            break
        if item.source_xml not in selected and can_select(item):
            select(item)

    train = [item for item in annotations if item.source_xml not in selected]
    return train, validation


def yolo_lines(annotation: Annotation, class_to_index: dict[str, int]) -> list[str]:
    lines: list[str] = []
    for class_name, xmin, ymin, xmax, ymax in annotation.boxes:
        center_x = (xmin + xmax) / (2 * annotation.width)
        center_y = (ymin + ymax) / (2 * annotation.height)
        box_width = (xmax - xmin) / annotation.width
        box_height = (ymax - ymin) / annotation.height
        lines.append(
            f"{class_to_index[class_name]} {center_x:.8f} {center_y:.8f} "
            f"{box_width:.8f} {box_height:.8f}"
        )
    return lines


def materialize_split(
    annotations: list[Annotation], split: str, output_dir: Path, class_to_index: dict[str, int]
) -> list[dict[str, object]]:
    image_dir = output_dir / "images" / split
    label_dir = output_dir / "labels" / split
    image_dir.mkdir(parents=True, exist_ok=True)
    label_dir.mkdir(parents=True, exist_ok=True)
    manifest: list[dict[str, object]] = []

    for annotation in annotations:
        with Image.open(annotation.source_image) as image:
            suffix = IMAGE_SUFFIXES.get(image.format or "", ".jpg")
        identifier = annotation.sha256[:20]
        image_name = f"{identifier}{suffix}"
        destination = image_dir / image_name
        shutil.copy2(annotation.source_image, destination)
        (label_dir / f"{identifier}.txt").write_text(
            "\n".join(yolo_lines(annotation, class_to_index)) + "\n", encoding="utf-8"
        )
        manifest.append(
            {
                "id": identifier,
                "source_image": annotation.source_image.name,
                "source_xml": annotation.source_xml.name,
                "sha256": annotation.sha256,
                "width": annotation.width,
                "height": annotation.height,
                "objects": len(annotation.boxes),
                "classes": sorted(annotation.classes),
            }
        )
    return manifest


def class_distribution(annotations: list[Annotation]) -> dict[str, int]:
    return dict(sorted(Counter(box[0] for item in annotations for box in item.boxes).items()))


def prepare(
    source_dir: Path,
    output_dir: Path,
    validation_fraction: float = 0.15,
    seed: int = 26180,
) -> dict[str, object]:
    raw_train, skipped_train = load_split(source_dir / "TRAIN")
    test, skipped_test = load_split(source_dir / "TEST")
    deduplicated_train, removed_duplicates = deduplicate(raw_train, test)
    train, validation = split_train_validation(deduplicated_train, validation_fraction, seed)
    classes = sorted({box[0] for item in (*train, *validation, *test) for box in item.boxes})
    class_to_index = {class_name: index for index, class_name in enumerate(classes)}

    if output_dir.exists():
        shutil.rmtree(output_dir)
    manifests = {
        "train": materialize_split(train, "train", output_dir, class_to_index),
        "validation": materialize_split(validation, "val", output_dir, class_to_index),
        "test": materialize_split(test, "test", output_dir, class_to_index),
    }
    yaml_names = "\n".join(f"  {index}: {json.dumps(name)}" for index, name in enumerate(classes))
    (output_dir / "data.yaml").write_text(
        f"path: {output_dir.resolve()}\ntrain: images/train\nval: images/val\ntest: images/test\nnames:\n{yaml_names}\n",
        encoding="utf-8",
    )
    report: dict[str, object] = {
        "prepared_at": datetime.now(UTC).isoformat(),
        "source": str(source_dir),
        "seed": seed,
        "validation_fraction": validation_fraction,
        "classes": classes,
        "class_to_index": class_to_index,
        "images": {"train": len(train), "validation": len(validation), "test": len(test)},
        "objects": {
            "train": sum(len(item.boxes) for item in train),
            "validation": sum(len(item.boxes) for item in validation),
            "test": sum(len(item.boxes) for item in test),
        },
        "class_distribution": {
            "train": class_distribution(train),
            "validation": class_distribution(validation),
            "test": class_distribution(test),
        },
        "skipped_annotations": {"train": skipped_train, "test": skipped_test},
        "removed_duplicates": removed_duplicates,
        "manifests": manifests,
    }
    (output_dir / "audit.json").write_text(json.dumps(report, indent=2) + "\n", encoding="utf-8")
    return report


def main() -> None:
    parser = argparse.ArgumentParser(description="Convert PlantDoc Pascal VOC data to YOLO format.")
    parser.add_argument("--source", type=Path, required=True)
    parser.add_argument("--output", type=Path, required=True)
    parser.add_argument("--validation-fraction", type=float, default=0.15)
    parser.add_argument("--seed", type=int, default=26180)
    arguments = parser.parse_args()
    report = prepare(arguments.source, arguments.output, arguments.validation_fraction, arguments.seed)
    print(json.dumps({key: report[key] for key in ("images", "objects", "skipped_annotations", "removed_duplicates")}, indent=2))


if __name__ == "__main__":
    main()