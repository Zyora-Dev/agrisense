from __future__ import annotations

import argparse
import csv
import hashlib
import json
import random
from collections import Counter
from datetime import UTC, datetime
from pathlib import Path

import numpy as np
import onnxruntime as ort
import torch
from PIL import Image
from torch import nn
from torch.utils.data import DataLoader, Dataset
from torchvision import transforms
from torchvision.models import MobileNet_V3_Large_Weights, mobilenet_v3_large


IMAGE_EXTENSIONS = {".jpg", ".jpeg", ".png", ".webp"}
IMAGE_SIZE = 224
MEAN = (0.485, 0.456, 0.406)
STD = (0.229, 0.224, 0.225)


def discover_images(dataset_dir: Path) -> tuple[list[str], list[tuple[Path, int]]]:
    class_dirs = sorted(path for path in dataset_dir.iterdir() if path.is_dir())
    if not class_dirs:
        raise ValueError(f"No class directories found in {dataset_dir}")
    classes = [path.name for path in class_dirs]
    samples = [
        (path, class_index)
        for class_index, class_dir in enumerate(class_dirs)
        for path in sorted(class_dir.rglob("*"))
        if path.is_file() and path.suffix.lower() in IMAGE_EXTENSIONS
    ]
    if not samples:
        raise ValueError(f"No supported images found in {dataset_dir}")
    return classes, samples


def file_sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as source:
        for chunk in iter(lambda: source.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def audit_samples(
    samples: list[tuple[Path, int]],
) -> tuple[list[tuple[Path, int, str]], dict[str, object]]:
    valid: list[tuple[Path, int, str]] = []
    corrupt: list[str] = []
    digest_labels: dict[str, set[int]] = {}
    duplicate_count = 0

    for path, label in samples:
        try:
            with Image.open(path) as image:
                image.verify()
            digest = file_sha256(path)
        except (OSError, ValueError):
            corrupt.append(str(path))
            continue
        labels = digest_labels.setdefault(digest, set())
        if labels:
            duplicate_count += 1
        labels.add(label)
        valid.append((path, label, digest))

    conflicts = {
        digest: sorted(labels)
        for digest, labels in digest_labels.items()
        if len(labels) > 1
    }
    if conflicts:
        raise ValueError(
            f"Found {len(conflicts)} exact image hashes assigned to multiple classes"
        )
    return valid, {
        "discovered_images": len(samples),
        "valid_images": len(valid),
        "corrupt_images": corrupt,
        "exact_duplicate_files": duplicate_count,
        "unique_image_hashes": len(digest_labels),
    }


def stratified_group_split(
    samples: list[tuple[Path, int, str]], seed: int
) -> dict[str, list[tuple[Path, int, str]]]:
    by_class: dict[int, dict[str, list[tuple[Path, int, str]]]] = {}
    for sample in samples:
        by_class.setdefault(sample[1], {}).setdefault(sample[2], []).append(sample)

    rng = random.Random(seed)
    splits = {"train": [], "validation": [], "test": []}
    for label in sorted(by_class):
        groups = list(by_class[label].values())
        if len(groups) < 5:
            raise ValueError(f"Class index {label} has too few unique images")
        rng.shuffle(groups)
        test_count = max(1, round(len(groups) * 0.15))
        validation_count = max(1, round(len(groups) * 0.15))
        split_groups = {
            "test": groups[:test_count],
            "validation": groups[test_count : test_count + validation_count],
            "train": groups[test_count + validation_count :],
        }
        for split_name, selected_groups in split_groups.items():
            splits[split_name].extend(sample for group in selected_groups for sample in group)
    for split in splits.values():
        rng.shuffle(split)
    return splits


class PlantDiseaseDataset(Dataset[tuple[torch.Tensor, int]]):
    def __init__(
        self,
        samples: list[tuple[Path, int, str]],
        transform: transforms.Compose,
    ) -> None:
        self.samples = samples
        self.transform = transform

    def __len__(self) -> int:
        return len(self.samples)

    def __getitem__(self, index: int) -> tuple[torch.Tensor, int]:
        path, label, _ = self.samples[index]
        with Image.open(path) as image:
            return self.transform(image.convert("RGB")), label


class NormalizedClassifier(nn.Module):
    def __init__(self, model: nn.Module) -> None:
        super().__init__()
        self.model = model
        self.register_buffer("mean", torch.tensor(MEAN).view(1, 3, 1, 1))
        self.register_buffer("std", torch.tensor(STD).view(1, 3, 1, 1))

    def forward(self, images: torch.Tensor) -> torch.Tensor:
        return self.model((images - self.mean) / self.std)


def classification_metrics(
    actual: np.ndarray, probabilities: np.ndarray, classes: list[str]
) -> dict[str, object]:
    predicted = probabilities.argmax(axis=1)
    top_three = np.argsort(probabilities, axis=1)[:, -3:]
    per_class: dict[str, dict[str, float | int]] = {}
    for index, name in enumerate(classes):
        true_positive = int(np.sum((actual == index) & (predicted == index)))
        false_positive = int(np.sum((actual != index) & (predicted == index)))
        false_negative = int(np.sum((actual == index) & (predicted != index)))
        precision = true_positive / (true_positive + false_positive) if true_positive + false_positive else 0.0
        recall = true_positive / (true_positive + false_negative) if true_positive + false_negative else 0.0
        f1 = 2 * precision * recall / (precision + recall) if precision + recall else 0.0
        per_class[name] = {
            "support": int(np.sum(actual == index)),
            "precision": precision,
            "recall": recall,
            "f1": f1,
        }
    return {
        "accuracy": float(np.mean(predicted == actual)),
        "top_3_accuracy": float(np.mean(np.any(top_three == actual[:, None], axis=1))),
        "macro_f1": float(np.mean([result["f1"] for result in per_class.values()])),
        "log_loss": float(
            -np.mean(
                np.log(np.clip(probabilities[np.arange(len(actual)), actual], 1e-15, 1.0))
            )
        ),
        "per_class": per_class,
    }


def evaluate(
    model: nn.Module, loader: DataLoader, device: torch.device
) -> tuple[float, np.ndarray, np.ndarray]:
    model.eval()
    losses: list[float] = []
    probabilities: list[np.ndarray] = []
    labels: list[np.ndarray] = []
    criterion = nn.CrossEntropyLoss()
    with torch.inference_mode():
        for images, targets in loader:
            images, targets = images.to(device), targets.to(device)
            logits = model(images)
            losses.append(float(criterion(logits, targets).item()) * len(targets))
            probabilities.append(logits.softmax(dim=1).cpu().numpy())
            labels.append(targets.cpu().numpy())
    return (
        sum(losses) / len(loader.dataset),
        np.concatenate(probabilities),
        np.concatenate(labels),
    )


def train(
    dataset_dir: Path,
    output_dir: Path,
    epochs: int,
    frozen_epochs: int,
    batch_size: int,
    num_workers: int,
    device_name: str,
    seed: int,
    patience: int,
) -> dict[str, object]:
    random.seed(seed)
    np.random.seed(seed)
    torch.manual_seed(seed)
    classes, discovered = discover_images(dataset_dir)
    audited, audit = audit_samples(discovered)
    splits = stratified_group_split(audited, seed)
    output_dir.mkdir(parents=True, exist_ok=True)

    with (output_dir / "split_manifest.csv").open("w", newline="", encoding="utf-8") as manifest:
        writer = csv.writer(manifest)
        writer.writerow(("split", "path", "class_index", "class_name", "sha256"))
        for split_name, samples in splits.items():
            for path, label, digest in samples:
                writer.writerow((split_name, path, label, classes[label], digest))

    train_transform = transforms.Compose(
        [
            transforms.RandomResizedCrop(IMAGE_SIZE, scale=(0.75, 1.0)),
            transforms.RandomHorizontalFlip(),
            transforms.RandomRotation(15),
            transforms.ColorJitter(brightness=0.2, contrast=0.2, saturation=0.2),
            transforms.ToTensor(),
            transforms.Normalize(MEAN, STD),
        ]
    )
    evaluation_transform = transforms.Compose(
        [
            transforms.Resize(256),
            transforms.CenterCrop(IMAGE_SIZE),
            transforms.ToTensor(),
            transforms.Normalize(MEAN, STD),
        ]
    )
    loaders = {
        "train": DataLoader(
            PlantDiseaseDataset(splits["train"], train_transform),
            batch_size=batch_size,
            shuffle=True,
            num_workers=num_workers,
            pin_memory=device_name.startswith("cuda"),
        ),
        "validation": DataLoader(
            PlantDiseaseDataset(splits["validation"], evaluation_transform),
            batch_size=batch_size,
            num_workers=num_workers,
            pin_memory=device_name.startswith("cuda"),
        ),
        "test": DataLoader(
            PlantDiseaseDataset(splits["test"], evaluation_transform),
            batch_size=batch_size,
            num_workers=num_workers,
            pin_memory=device_name.startswith("cuda"),
        ),
    }

    device = torch.device(device_name)
    model = mobilenet_v3_large(weights=MobileNet_V3_Large_Weights.DEFAULT)
    model.classifier[3] = nn.Linear(model.classifier[3].in_features, len(classes))
    model.to(device)
    criterion = nn.CrossEntropyLoss(label_smoothing=0.1)
    best_loss = float("inf")
    epochs_without_improvement = 0
    history: list[dict[str, float | int]] = []

    for epoch in range(epochs):
        backbone_frozen = epoch < frozen_epochs
        for parameter in model.features.parameters():
            parameter.requires_grad = not backbone_frozen
        optimizer = torch.optim.AdamW(
            (parameter for parameter in model.parameters() if parameter.requires_grad),
            lr=1e-3 if backbone_frozen else 1e-4,
            weight_decay=1e-4,
        )
        model.train()
        train_loss = 0.0
        train_correct = 0
        train_count = 0
        for images, targets in loaders["train"]:
            images, targets = images.to(device), targets.to(device)
            optimizer.zero_grad(set_to_none=True)
            logits = model(images)
            loss = criterion(logits, targets)
            loss.backward()
            optimizer.step()
            train_loss += float(loss.item()) * len(targets)
            train_correct += int((logits.argmax(dim=1) == targets).sum().item())
            train_count += len(targets)

        validation_loss, validation_probabilities, validation_labels = evaluate(
            model, loaders["validation"], device
        )
        epoch_result = {
            "epoch": epoch + 1,
            "train_loss": train_loss / train_count,
            "train_accuracy": train_correct / train_count,
            "validation_loss": validation_loss,
            "validation_accuracy": float(
                np.mean(validation_probabilities.argmax(axis=1) == validation_labels)
            ),
        }
        history.append(epoch_result)
        print(json.dumps(epoch_result), flush=True)
        if validation_loss < best_loss:
            best_loss = validation_loss
            epochs_without_improvement = 0
            torch.save(model.state_dict(), output_dir / "best.pt")
        else:
            epochs_without_improvement += 1
            if epochs_without_improvement >= patience and epoch + 1 >= frozen_epochs:
                break

    model.load_state_dict(torch.load(output_dir / "best.pt", map_location=device, weights_only=True))
    test_loss, test_probabilities, test_labels = evaluate(model, loaders["test"], device)
    test_metrics = classification_metrics(test_labels, test_probabilities, classes)
    test_metrics["loss"] = test_loss

    export_model = NormalizedClassifier(model.cpu()).eval()
    onnx_path = output_dir / "model.onnx"
    torch.onnx.export(
        export_model,
        torch.rand(1, 3, IMAGE_SIZE, IMAGE_SIZE),
        onnx_path,
        input_names=["images"],
        output_names=["logits"],
        dynamic_axes={"images": {0: "batch"}, "logits": {0: "batch"}},
        opset_version=18,
        dynamo=False,
    )
    sample_images, _ = next(iter(loaders["test"]))
    raw_sample = sample_images[:8] * torch.tensor(STD).view(1, 3, 1, 1) + torch.tensor(MEAN).view(1, 3, 1, 1)
    with torch.inference_mode():
        torch_logits = export_model(raw_sample).numpy()
    onnx_logits = ort.InferenceSession(str(onnx_path), providers=["CPUExecutionProvider"]).run(
        ["logits"], {"images": raw_sample.numpy()}
    )[0]
    parity_max_absolute_difference = float(np.max(np.abs(torch_logits - onnx_logits)))

    metadata: dict[str, object] = {
        "model_type": "mobilenet_v3_large_plant_disease_classifier",
        "trained_at": datetime.now(UTC).isoformat(),
        "classes": classes,
        "dataset": {
            "path": str(dataset_dir),
            **audit,
            "class_counts": dict(
                sorted(Counter(classes[label] for _, label, _ in audited).items())
            ),
        },
        "splits": {name: len(samples) for name, samples in splits.items()},
        "parameters": {
            "epochs_requested": epochs,
            "frozen_epochs": frozen_epochs,
            "epochs_completed": len(history),
            "batch_size": batch_size,
            "num_workers": num_workers,
            "image_size": IMAGE_SIZE,
            "device": device_name,
            "seed": seed,
            "patience": patience,
        },
        "history": history,
        "test_metrics": test_metrics,
        "onnx": {
            "path": str(onnx_path),
            "input": "float32 RGB in [0, 1], NCHW, 224x224",
            "normalization_embedded": True,
            "parity_max_absolute_difference": parity_max_absolute_difference,
        },
        "scope": "Plant disease image classification; not object detection or field validation.",
    }
    (output_dir / "metadata.json").write_text(
        json.dumps(metadata, indent=2) + "\n", encoding="utf-8"
    )
    print(json.dumps(test_metrics, indent=2), flush=True)
    return metadata


def main() -> None:
    parser = argparse.ArgumentParser(description="Train the AgriSense plant-disease classifier.")
    parser.add_argument("--dataset", type=Path, required=True)
    parser.add_argument("--output", type=Path, required=True)
    parser.add_argument("--epochs", type=int, default=15)
    parser.add_argument("--frozen-epochs", type=int, default=3)
    parser.add_argument("--batch-size", type=int, default=64)
    parser.add_argument("--num-workers", type=int, default=0)
    parser.add_argument("--device", default="mps")
    parser.add_argument("--seed", type=int, default=26180)
    parser.add_argument("--patience", type=int, default=4)
    arguments = parser.parse_args()
    train(
        arguments.dataset,
        arguments.output,
        arguments.epochs,
        arguments.frozen_epochs,
        arguments.batch_size,
        arguments.num_workers,
        arguments.device,
        arguments.seed,
        arguments.patience,
    )


if __name__ == "__main__":
    main()