from __future__ import annotations

import json
import subprocess
from pathlib import Path

import modal


APP_NAME = "agrisense-plant-disease-training"
VOLUME_NAME = "agrisense-plant-disease-artifacts"
ARCHIVE_NAME = "Plant_leaf_diseases_dataset_without_augmentation.zip"
DATASET_NAME = "Plant_leave_diseases_dataset_without_augmentation"

app = modal.App(APP_NAME)
artifacts = modal.Volume.from_name(VOLUME_NAME, create_if_missing=True)
image = (
    modal.Image.debian_slim(python_version="3.12")
    .apt_install("unzip")
    .pip_install(
        "numpy==2.2.6",
        "onnx==1.22.0",
        "onnxruntime==1.22.1",
        "pillow==11.3.0",
        "torch==2.7.1",
        "torchvision==0.22.1",
    )
    .add_local_file(
        "ml/train_plant_disease_classifier.py",
        remote_path="/workspace/ml/train_plant_disease_classifier.py",
    )
    .add_local_file(
        f"ml/data/raw/plant-leaf-diseases-mendeley-v1/{ARCHIVE_NAME}",
        remote_path=f"/workspace/{ARCHIVE_NAME}",
    )
)


@app.function(
    image=image,
    gpu="A100-80GB",
    cpu=12,
    memory=32768,
    timeout=5 * 60 * 60,
    volumes={"/artifacts": artifacts},
)
def train_on_a100() -> dict[str, object]:
    import torch

    if not torch.cuda.is_available():
        raise RuntimeError("Modal allocated no CUDA device")
    device_name = torch.cuda.get_device_name(0)
    if "A100" not in device_name or torch.cuda.get_device_properties(0).total_memory < 70 * 1024**3:
        raise RuntimeError(f"Expected an A100 80GB, received {device_name}")

    dataset_root = Path("/workspace/dataset")
    subprocess.run(
        ["unzip", "-q", f"/workspace/{ARCHIVE_NAME}", "-d", str(dataset_root)],
        check=True,
    )
    output_dir = Path("/artifacts/mobilenetv3-plant-disease-v1")
    output_dir.mkdir(parents=True, exist_ok=True)
    print(
        json.dumps(
            {
                "device": device_name,
                "cuda": torch.version.cuda,
                "batch_size": 256,
                "num_workers": 8,
            }
        ),
        flush=True,
    )
    subprocess.run(
        [
            "python",
            "/workspace/ml/train_plant_disease_classifier.py",
            "--dataset",
            str(dataset_root / DATASET_NAME),
            "--output",
            str(output_dir),
            "--epochs",
            "15",
            "--frozen-epochs",
            "3",
            "--batch-size",
            "256",
            "--num-workers",
            "8",
            "--device",
            "cuda",
            "--seed",
            "26180",
            "--patience",
            "4",
        ],
        check=True,
    )
    artifacts.commit()
    metadata = json.loads((output_dir / "metadata.json").read_text(encoding="utf-8"))
    return {
        "device": device_name,
        "epochs_completed": metadata["parameters"]["epochs_completed"],
        "test_metrics": metadata["test_metrics"],
        "onnx": metadata["onnx"],
        "volume": VOLUME_NAME,
        "artifact_path": str(output_dir.relative_to("/artifacts")),
    }


@app.local_entrypoint()
def main() -> None:
    function_call = train_on_a100.spawn()
    print(json.dumps({"function_call_id": function_call.object_id}), flush=True)