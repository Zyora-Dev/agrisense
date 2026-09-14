import { readFile } from "node:fs/promises";
import path from "node:path";
import { getProfile } from "@/lib/auth";

const classifier = path.join(process.cwd(), "../ml/artifacts/mobilenetv3-plant-disease-a100-v1/mobilenetv3-plant-disease-v1");
const runtime = path.join(process.cwd(), "node_modules/onnxruntime-web/dist");
const assets: Record<string, [string, string]> = {
  "classifier.onnx": [path.join(classifier, "model.onnx"), "application/octet-stream"],
  "classes.json": [path.join(classifier, "metadata.json"), "application/json"],
  "detector.onnx": [path.join(process.cwd(), "../ml/artifacts/yolo-plantdoc-v1/best.onnx"), "application/octet-stream"],
  "ort-wasm-simd-threaded.mjs": [path.join(runtime, "ort-wasm-simd-threaded.mjs"), "text/javascript"],
  "ort-wasm-simd-threaded.wasm": [path.join(runtime, "ort-wasm-simd-threaded.wasm"), "application/wasm"],
};

export async function GET(_request: Request, context: { params: Promise<{ asset: string }> }) {
  const { asset } = await context.params;
  const entry = Object.hasOwn(assets, asset) ? assets[asset] : undefined;
  if (!entry) return Response.json({ error: "Not found" }, { status: 404 });
  try {
    if (!await getProfile()) return Response.json({ error: "Authentication required" }, { status: 401 });
    const data = await readFile(entry[0]);
    if (asset === "classes.json") {
      const metadata = JSON.parse(data.toString());
      return Response.json({ classes: metadata.classes, scope: metadata.scope });
    }
    return new Response(new Uint8Array(data), {
      headers: { "Content-Type": entry[1], "Cache-Control": "private, max-age=3600", "X-Content-Type-Options": "nosniff" },
    });
  } catch {
    return Response.json({ error: "Model assets unavailable" }, { status: 503 });
  }
}