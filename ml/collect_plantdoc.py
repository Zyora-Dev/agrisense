from __future__ import annotations

import argparse
import hashlib
import json
import time
import urllib.error
import urllib.parse
import urllib.request
from concurrent.futures import ThreadPoolExecutor, as_completed
from pathlib import Path


REPOSITORY = "pratikkayal/PlantDoc-Object-Detection-Dataset"
COMMIT = "4730a233a555b30ee98e0879c63ad25d82407455"
RAW_ROOT = f"https://raw.githubusercontent.com/{REPOSITORY}/{COMMIT}"


def git_blob_sha(data: bytes) -> str:
    header = f"blob {len(data)}\0".encode()
    return hashlib.sha1(header + data).hexdigest()


def selected_entries(tree_path: Path) -> list[dict[str, object]]:
    tree = json.loads(tree_path.read_text(encoding="utf-8"))
    if tree.get("truncated"):
        raise ValueError("GitHub tree response is truncated")

    selected = []
    for entry in tree["tree"]:
        path = str(entry["path"])
        if entry["type"] != "blob":
            continue
        if path in {"LICENSE", "README.md", "train_labels.csv", "test_labels.csv"}:
            selected.append(entry)
        elif path.startswith(("TRAIN/", "TEST/")):
            selected.append(entry)
    return selected


def download_entry(entry: dict[str, object], destination: Path, retries: int) -> str:
    relative_path = Path(str(entry["path"]))
    expected_sha = str(entry["sha"])
    output_path = destination / relative_path

    if output_path.is_file() and git_blob_sha(output_path.read_bytes()) == expected_sha:
        return "skipped"

    output_path.parent.mkdir(parents=True, exist_ok=True)
    url = f"{RAW_ROOT}/{urllib.parse.quote(relative_path.as_posix(), safe='/')}"
    for attempt in range(retries + 1):
        try:
            request = urllib.request.Request(url, headers={"User-Agent": "AgriSense-dataset-collector/1.0"})
            with urllib.request.urlopen(request, timeout=60) as response:
                data = response.read()
            if git_blob_sha(data) != expected_sha:
                raise ValueError(f"SHA mismatch for {relative_path}")
            temporary_path = output_path.with_suffix(output_path.suffix + ".part")
            temporary_path.write_bytes(data)
            temporary_path.replace(output_path)
            return "downloaded"
        except (OSError, ValueError, urllib.error.URLError):
            if attempt == retries:
                raise
            time.sleep(2**attempt)
    raise RuntimeError("unreachable")


def collect(tree_path: Path, destination: Path, workers: int, retries: int) -> dict[str, object]:
    entries = selected_entries(tree_path)
    counts = {"downloaded": 0, "skipped": 0, "failed": 0}
    failures: list[str] = []

    with ThreadPoolExecutor(max_workers=workers) as executor:
        futures = {
            executor.submit(download_entry, entry, destination, retries): str(entry["path"])
            for entry in entries
        }
        for completed, future in enumerate(as_completed(futures), start=1):
            path = futures[future]
            try:
                counts[future.result()] += 1
            except Exception as error:
                counts["failed"] += 1
                failures.append(f"{path}: {error}")
            if completed % 250 == 0 or completed == len(entries):
                print(f"{completed}/{len(entries)} files: {counts}", flush=True)

    manifest = {
        "repository": REPOSITORY,
        "commit": COMMIT,
        "files_expected": len(entries),
        "counts": counts,
        "failures": failures,
    }
    destination.mkdir(parents=True, exist_ok=True)
    (destination / "collection-manifest.json").write_text(
        json.dumps(manifest, indent=2) + "\n", encoding="utf-8"
    )
    return manifest


def main() -> None:
    parser = argparse.ArgumentParser(description="Collect PlantDoc files from a pinned Git commit.")
    parser.add_argument("--tree", type=Path, required=True)
    parser.add_argument("--destination", type=Path, required=True)
    parser.add_argument("--workers", type=int, default=8)
    parser.add_argument("--retries", type=int, default=3)
    arguments = parser.parse_args()
    manifest = collect(arguments.tree, arguments.destination, arguments.workers, arguments.retries)
    print(json.dumps(manifest["counts"], indent=2))
    if manifest["failures"]:
        raise SystemExit(1)


if __name__ == "__main__":
    main()