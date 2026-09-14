import type { InferenceSession } from "onnxruntime-web";

export type Prediction = { label: string; confidence: number };
export type Detection = Prediction & { box: [number, number, number, number] };
export type ImageObservation = {
  farm_id: string;
  captured_at: string;
  source: "upload" | "camera";
  classifier_version: "mobilenetv3-plant-disease-a100-v1";
  detector_version: "yolo-plantdoc-v1";
  classifications: Prediction[];
  detections: Prediction[];
};

const detectorClasses = [
  "Apple Scab Leaf", "Apple leaf", "Apple rust leaf", "Bell_pepper leaf",
  "Bell_pepper leaf spot", "Blueberry leaf", "Cherry leaf", "Corn Gray leaf spot",
  "Corn leaf blight", "Corn rust leaf", "Peach leaf", "Potato leaf",
  "Potato leaf early blight", "Potato leaf late blight", "Raspberry leaf", "Soyabean leaf",
  "Squash Powdery mildew leaf", "Strawberry leaf", "Tomato Early blight leaf",
  "Tomato Septoria leaf spot", "Tomato leaf", "Tomato leaf bacterial spot",
  "Tomato leaf late blight", "Tomato leaf mosaic virus", "Tomato leaf yellow virus",
  "Tomato mold leaf", "Tomato two spotted spider mites leaf", "grape leaf", "grape leaf black rot",
];

let models: Promise<{ classifier: InferenceSession; detector: InferenceSession; classes: string[] }> | undefined;

async function loadModels() {
  if (!models) models = (async () => {
    const ort = await import("onnxruntime-web/wasm");
    ort.env.wasm.numThreads = 1;
    ort.env.wasm.wasmPaths = {
      mjs: new URL("/api/vision-assets/ort-wasm-simd-threaded.mjs", location.origin).href,
      wasm: new URL("/api/vision-assets/ort-wasm-simd-threaded.wasm", location.origin).href,
    };
    const response = await fetch("/api/vision-assets/classes.json");
    if (!response.ok) throw new Error("Model labels could not be loaded. Check your session.");
    const { classes } = await response.json();
    if (!Array.isArray(classes) || classes.length !== 39) throw new Error("Classifier label map is invalid.");
    const classifier = await ort.InferenceSession.create("/api/vision-assets/classifier.onnx", { executionProviders: ["wasm"] });
    try {
      const detector = await ort.InferenceSession.create("/api/vision-assets/detector.onnx", { executionProviders: ["wasm"] });
      return { classifier, detector, classes };
    } catch (error) { await classifier.release(); throw error; }
  })().catch((error) => { models = undefined; throw error; });
  return models;
}

function pixels(canvas: HTMLCanvasElement): Float32Array {
  const context = canvas.getContext("2d");
  if (!context) throw new Error("Image processing is unavailable.");
  const rgba = context.getImageData(0, 0, canvas.width, canvas.height).data;
  const plane = canvas.width * canvas.height;
  const result = new Float32Array(plane * 3);
  for (let pixel = 0; pixel < plane; pixel++) {
    for (let channel = 0; channel < 3; channel++) result[channel * plane + pixel] = rgba[pixel * 4 + channel] / 255;
  }
  return result;
}

export function suppressOverlaps(candidates: Detection[], threshold = 0.45): Detection[] {
  const selected: Detection[] = [];
  for (const candidate of candidates.sort((first, second) => second.confidence - first.confidence).slice(0, 1000)) {
    const overlaps = selected.some((previous) => {
      if (previous.label !== candidate.label) return false;
      const [left, top, right, bottom] = candidate.box;
      const [otherLeft, otherTop, otherRight, otherBottom] = previous.box;
      const intersection = Math.max(0, Math.min(right, otherRight) - Math.max(left, otherLeft))
        * Math.max(0, Math.min(bottom, otherBottom) - Math.max(top, otherTop));
      const union = (right - left) * (bottom - top) + (otherRight - otherLeft) * (otherBottom - otherTop) - intersection;
      return union > 0 && intersection / union > threshold;
    });
    if (!overlaps) selected.push(candidate);
    if (selected.length === 20) break;
  }
  return selected;
}

export async function analyzeImage(blob: Blob, farmId: string, source: "upload" | "camera") {
  if (blob.size > 10 * 1024 * 1024) throw new Error("Choose an image smaller than 10 MB.");
  if (!["image/jpeg", "image/png", "image/webp"].includes(blob.type)) throw new Error("Use a JPEG, PNG, or WebP image.");
  const image = await createImageBitmap(blob);
  try {
    if (image.width * image.height > 25000000) throw new Error("Image exceeds the 25 megapixel limit.");
    const { classifier, detector, classes } = await loadModels();
    const ort = await import("onnxruntime-web/wasm");
    const crop = document.createElement("canvas");
    crop.width = crop.height = 224;
    const cropContext = crop.getContext("2d")!;
    const scale = 256 / Math.min(image.width, image.height);
    const cropSize = 224 / scale;
    cropContext.drawImage(image, (image.width - cropSize) / 2, (image.height - cropSize) / 2,
      cropSize, cropSize, 0, 0, 224, 224);
    const classifierOutput = await classifier.run({ images: new ort.Tensor("float32", pixels(crop), [1, 3, 224, 224]) });
    const logits = Array.from(classifierOutput.logits.data as Float32Array);
    if (logits.length !== classes.length || logits.some((value) => !Number.isFinite(value))) throw new Error("Classifier returned invalid scores.");
    const maximum = Math.max(...logits);
    const exponentials = logits.map((value) => Math.exp(value - maximum));
    const total = exponentials.reduce((sum, value) => sum + value, 0);
    const classifications = exponentials.map((value, index) => ({ label: classes[index], confidence: value / total }))
      .sort((first, second) => second.confidence - first.confidence).slice(0, 3);

    const frame = document.createElement("canvas");
    frame.width = frame.height = 512;
    const context = frame.getContext("2d")!;
    context.fillStyle = "rgb(114,114,114)";
    context.fillRect(0, 0, 512, 512);
    const ratio = 512 / Math.max(image.width, image.height);
    const width = Math.round(image.width * ratio);
    const height = Math.round(image.height * ratio);
    const offsetX = Math.floor((512 - width) / 2);
    const offsetY = Math.floor((512 - height) / 2);
    context.drawImage(image, offsetX, offsetY, width, height);
    const output = await detector.run({ images: new ort.Tensor("float32", pixels(frame), [1, 3, 512, 512]) });
    const tensor = output.output0;
    if (tensor.dims.length !== 3 || tensor.dims[1] !== 33) throw new Error("Detector output shape is unsupported.");
    const anchors = tensor.dims[2];
    const values = tensor.data as Float32Array;
    const candidates: Detection[] = [];
    for (let anchor = 0; anchor < anchors; anchor++) {
      let classIndex = 0;
      for (let index = 1; index < detectorClasses.length; index++) {
        if (values[(index + 4) * anchors + anchor] > values[(classIndex + 4) * anchors + anchor]) classIndex = index;
      }
      const confidence = values[(classIndex + 4) * anchors + anchor];
      if (!Number.isFinite(confidence) || confidence < 0.25) continue;
      const centerX = values[anchor];
      const centerY = values[anchors + anchor];
      const boxWidth = values[2 * anchors + anchor];
      const boxHeight = values[3 * anchors + anchor];
      const clamp = (value: number) => Math.max(0, Math.min(1, value));
      const box: Detection["box"] = [clamp((centerX - boxWidth / 2 - offsetX) / width),
        clamp((centerY - boxHeight / 2 - offsetY) / height), clamp((centerX + boxWidth / 2 - offsetX) / width),
        clamp((centerY + boxHeight / 2 - offsetY) / height)];
      if (box.every(Number.isFinite) && box[2] > box[0] && box[3] > box[1]) candidates.push({ label: detectorClasses[classIndex], confidence, box });
    }
    const detections = suppressOverlaps(candidates);
    const observation: ImageObservation = {
      farm_id: farmId, captured_at: new Date().toISOString(), source,
      classifier_version: "mobilenetv3-plant-disease-a100-v1", detector_version: "yolo-plantdoc-v1",
      classifications, detections: detections.map(({ label, confidence }) => ({ label, confidence })),
    };
    return { observation, detections, width: image.width, height: image.height };
  } finally { image.close(); }
}