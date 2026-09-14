import sys
import xml.etree.ElementTree as ET
from pathlib import Path

from PIL import Image


sys.path.insert(0, str(Path(__file__).parents[1]))

from prepare_plantdoc_yolo import load_split, split_train_validation, yolo_lines


def write_pair(folder: Path, stem: str, class_name: str, xml_size: tuple[int, int] = (100, 50)) -> None:
    folder.mkdir(parents=True, exist_ok=True)
    Image.new("RGB", (100, 50), "green").save(folder / f"{stem}.jpg")
    width, height = xml_size
    annotation = ET.fromstring(
        f"""<annotation><filename>{stem}.jpg</filename><size><width>{width}</width><height>{height}</height></size>
        <object><name>{class_name}</name><bndbox><xmin>10</xmin><ymin>5</ymin><xmax>50</xmax><ymax>25</ymax></bndbox></object></annotation>"""
    )
    ET.ElementTree(annotation).write(folder / f"{stem}.xml", encoding="unicode")


def test_load_split_uses_actual_image_dimensions(tmp_path: Path) -> None:
    write_pair(tmp_path, "leaf", "healthy", xml_size=(0, 0))

    annotations, skipped = load_split(tmp_path)

    assert skipped == []
    assert (annotations[0].width, annotations[0].height) == (100, 50)
    assert yolo_lines(annotations[0], {"healthy": 0}) == [
        "0 0.30000000 0.30000000 0.40000000 0.40000000"
    ]


def test_load_split_reports_missing_images(tmp_path: Path) -> None:
    (tmp_path / "missing.xml").write_text(
        "<annotation><filename>missing.jpg</filename></annotation>", encoding="utf-8"
    )

    annotations, skipped = load_split(tmp_path)

    assert annotations == []
    assert skipped == [{"xml": "missing.xml", "reason": "missing.jpg"}]


def test_validation_split_is_deterministic_and_covers_classes(tmp_path: Path) -> None:
    for index in range(20):
        write_pair(tmp_path, f"leaf-{index}", "healthy" if index % 2 else "rust")
    write_pair(tmp_path, "rare-leaf", "rare")
    annotations, _ = load_split(tmp_path)

    first_train, first_validation = split_train_validation(annotations, 0.2, 26180)
    second_train, second_validation = split_train_validation(annotations, 0.2, 26180)

    assert [item.source_xml for item in first_validation] == [item.source_xml for item in second_validation]
    assert len(first_train) == 17
    assert len(first_validation) == 4
    assert {name for item in first_validation for name in item.classes} == {"healthy", "rust"}
    assert {name for item in first_train for name in item.classes} == {"healthy", "rare", "rust"}