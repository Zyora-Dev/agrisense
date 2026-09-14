"use client";

import { FormEvent, useEffect, useEffectEvent, useRef, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { Camera, ImagePlus, Leaf, LoaderCircle, Menu, MessageCircle, RefreshCw, Send, Trash2 } from "lucide-react";
import { Brand } from "@/components/brand";
import { WorkspaceNav } from "@/components/workspace-nav";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Sheet, SheetContent, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { analyzeImage, type ImageObservation, type Detection } from "@/lib/vision";
import type { Farm, Profile } from "@/lib/auth";

type Analysis = {
  contains_simulated_data: boolean;
  input_status: string;
  missing_metrics: string[];
  stale_metrics: string[];
  inputs: { metric: string; value: number; unit: string; source: string; is_stale: boolean }[];
  model: { status: string; reason: string | null; scope: string; predictions: { crop: string; confidence: number }[] };
};
type Advice = {
  summary: string;
  recommendations: { priority: string; title: string; action: string; reason: string; precaution: string }[];
  follow_up_measurements: string[];
  uses_simulated_data: boolean;
  disclaimer: string;
  model: string;
};
type Message = { role: "user" | "assistant"; text: string };
const readable = (value: string) => value.replaceAll("_", " ");
const percent = (value: number) => `${(value * 100).toFixed(1)}%`;

async function readResponse(response: Response) {
  const data = await response.json();
  if (!response.ok) throw new Error(typeof data.detail === "string" ? data.detail : data.error ?? "Request failed. Please try again.");
  return data;
}

export function AssistantWorkspace({ profile, farms }: { profile: Profile; farms: Farm[] }) {
  const [farmId, setFarmId] = useState(farms[0]?.id ?? "");
  return <div className="dashboard-shell">
    <aside className="dashboard-sidebar hidden lg:flex"><Brand light /><WorkspaceNav /></aside>
    <main className="min-w-0 flex-1">
      <header className="dashboard-header">
        <div className="flex items-center gap-3 lg:hidden"><Sheet><SheetTrigger asChild><Button variant="outline" size="icon" aria-label="Open navigation"><Menu /></Button></SheetTrigger><SheetContent side="left" className="w-[290px] border-0 bg-[#123d2b] p-6 text-white"><SheetTitle className="sr-only">Navigation</SheetTitle><Brand light /><WorkspaceNav /></SheetContent></Sheet><Brand /></div>
        <h1 className="hidden text-xl font-semibold text-zinc-950 lg:block">Farm assistant</h1>
        <span className="ml-auto hidden max-w-64 truncate text-sm font-medium text-zinc-800 sm:block" title={profile.full_name}>{profile.full_name}</span>
      </header>
      <div className="dashboard-content">
        <div className="flex flex-wrap items-end justify-between gap-5">
          <div><p className="eyebrow">AgriSense AI</p><h2 className="mt-2 text-2xl font-semibold text-zinc-950">Your field, in focus</h2></div>
          {farms.length > 0 && <div className="space-y-2"><Label htmlFor="assistant-farm">Farm</Label><select id="assistant-farm" className="h-10 w-full max-w-72 rounded-md border bg-white px-3 text-sm text-zinc-900" value={farmId} onChange={(event) => setFarmId(event.target.value)}>{farms.map((farm) => <option key={farm.id} value={farm.id}>{farm.name}</option>)}</select></div>}
        </div>
        {farmId ? <FarmAssistant key={farmId} farmId={farmId} /> : <div className="py-16 text-center"><p className="text-zinc-800">No farms yet.</p><Button asChild className="mt-5"><Link href="/farms">Add a farm</Link></Button></div>}
      </div>
    </main>
  </div>;
}

function FarmAssistant({ farmId }: { farmId: string }) {
  const [tab, setTab] = useState("images");
  const [analysis, setAnalysis] = useState<Analysis | null>(null);
  const [analysisError, setAnalysisError] = useState("");
  const [loadingAnalysis, setLoadingAnalysis] = useState(true);
  const [image, setImage] = useState<ImageObservation | null>(null);
  const [detections, setDetections] = useState<Detection[]>([]);
  const [preview, setPreview] = useState("");
  const [aspect, setAspect] = useState(1);
  const [imageBusy, setImageBusy] = useState(false);
  const [imageError, setImageError] = useState("");
  const [cameraUrl, setCameraUrl] = useState("");
  const [monitoring, setMonitoring] = useState(false);
  const [advice, setAdvice] = useState<Advice | null>(null);
  const [adviceBusy, setAdviceBusy] = useState(false);
  const [adviceError, setAdviceError] = useState("");
  const [messages, setMessages] = useState<Message[]>([]);
  const [question, setQuestion] = useState("");
  const [chatBusy, setChatBusy] = useState(false);
  const [chatError, setChatError] = useState("");
  const [chatNotice, setChatNotice] = useState("");
  const lifetime = useRef<AbortController | null>(null);
  const imageLock = useRef(false);
  const previewUrl = useRef("");
  const chatEnd = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const controller = new AbortController();
    lifetime.current = controller;
    fetch(`/api/farms/${farmId}/analysis`, { signal: controller.signal, cache: "no-store" })
      .then(readResponse).then((data) => { if (!controller.signal.aborted) setAnalysis(data); })
      .catch((error: Error) => { if (!controller.signal.aborted) setAnalysisError(error.message); })
      .finally(() => { if (!controller.signal.aborted) setLoadingAnalysis(false); });
    return () => { controller.abort(); URL.revokeObjectURL(previewUrl.current); };
  }, [farmId]);

  useEffect(() => { if (tab === "chat") chatEnd.current?.scrollIntoView({ block: "nearest" }); }, [messages, tab]);

  const refreshCamera = useEffectEvent(() => {
    if (tab === "images" && !imageBusy && !adviceBusy && !chatBusy && document.visibilityState === "visible") void captureCamera();
  });
  useEffect(() => {
    if (!monitoring) return;
    const timer = setInterval(() => refreshCamera(), 30000);
    return () => clearInterval(timer);
  }, [monitoring]);

  async function refreshAnalysis() {
    setLoadingAnalysis(true); setAnalysisError("");
    try {
      const data = await readResponse(await fetch(`/api/farms/${farmId}/analysis`, { signal: lifetime.current?.signal, cache: "no-store" }));
      if (!lifetime.current?.signal.aborted) setAnalysis(data);
    } catch (error) { if (!lifetime.current?.signal.aborted) setAnalysisError((error as Error).message); }
    finally { if (!lifetime.current?.signal.aborted) setLoadingAnalysis(false); }
  }

  function clearImage() {
    URL.revokeObjectURL(previewUrl.current); previewUrl.current = "";
    setPreview(""); setImage(null); setDetections([]); setAdvice(null);
  }

  async function processImage(blob: Blob, source: "upload" | "camera") {
    if (imageLock.current) return;
    imageLock.current = true; setImageBusy(true); setImageError(""); clearImage();
    try {
      const result = await analyzeImage(blob, farmId, source);
      if (lifetime.current?.signal.aborted) return;
      previewUrl.current = URL.createObjectURL(blob);
      setPreview(previewUrl.current); setAspect(result.width / result.height);
      setImage(result.observation); setDetections(result.detections);
    } catch (error) { if (!lifetime.current?.signal.aborted) setImageError((error as Error).message); }
    finally { imageLock.current = false; if (!lifetime.current?.signal.aborted) setImageBusy(false); }
  }

  async function captureCamera() {
    setImageError("");
    try {
      const url = new URL(cameraUrl);
      if (!["http:", "https:"].includes(url.protocol) || url.username || url.password) throw new Error("Use an HTTP(S) snapshot URL without credentials.");
      setImageBusy(true);
      const response = await fetch(url, { signal: AbortSignal.any([lifetime.current!.signal, AbortSignal.timeout(10000)]), cache: "no-store", credentials: "omit" });
      if (!response.ok) throw new Error("Camera snapshot is unavailable.");
      const blob = await response.blob();
      await processImage(blob, "camera");
    } catch (error) {
      if (!lifetime.current?.signal.aborted) {
        setMonitoring(false);
        setImageError((error as Error).name === "TypeError" ? "Cannot read camera snapshot. Check its URL, network access and camera CORS settings." : (error as Error).message);
      }
    } finally { if (!lifetime.current?.signal.aborted) setImageBusy(false); }
  }

  async function getAdvice() {
    setAdviceBusy(true); setAdviceError("");
    try {
      const data = await readResponse(await fetch(`/api/farms/${farmId}/recommendations`, {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ image }), signal: lifetime.current?.signal,
      }));
      if (!lifetime.current?.signal.aborted) { setAdvice(data); void refreshAnalysis(); }
    } catch (error) { if (!lifetime.current?.signal.aborted) setAdviceError((error as Error).message); }
    finally { if (!lifetime.current?.signal.aborted) setAdviceBusy(false); }
  }

  async function sendMessage(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const text = question.trim();
    if (!text || chatBusy) return;
    setChatBusy(true); setChatError("");
    try {
      const data = await readResponse(await fetch(`/api/farms/${farmId}/chat`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: text, history: messages.slice(-12).map((message) => ({ ...message, text: message.text.slice(0, 1500) })), image }), signal: lifetime.current?.signal,
      }));
      if (!lifetime.current?.signal.aborted) {
        setMessages((previous) => [...previous, { role: "user", text }, { role: "assistant", text: data.answer }]);
        setQuestion(""); setChatNotice(`${data.uses_simulated_data ? "Includes simulated readings. " : ""}${data.disclaimer}`);
      }
    } catch (error) { if (!lifetime.current?.signal.aborted) setChatError((error as Error).message); }
    finally { if (!lifetime.current?.signal.aborted) setChatBusy(false); }
  }

  const locked = imageBusy || adviceBusy || chatBusy;
  return <div className="mt-7 space-y-7 text-zinc-900">
    <section className="border-y border-zinc-200 py-5" aria-label="Farm analysis">
      <div className="flex flex-wrap items-center justify-between gap-3"><h3 className="font-semibold">Field analysis</h3><div className="flex items-center gap-3"><Link href="/readings" className="text-sm font-medium text-green-800 underline">Field readings</Link><Button size="icon" variant="outline" disabled={loadingAnalysis} onClick={refreshAnalysis} title="Refresh field analysis" aria-label="Refresh field analysis"><RefreshCw className={loadingAnalysis ? "animate-spin" : ""} /></Button></div></div>
      {loadingAnalysis && <p role="status" className="mt-3 text-sm">Loading current readings...</p>}
      {analysisError && <ErrorNotice message={analysisError} />}
      {analysis && <><div className="mt-4 flex flex-wrap gap-2 text-xs font-medium"><span className="rounded border border-zinc-300 px-2 py-1 capitalize">{analysis.input_status}</span>{analysis.contains_simulated_data && <span className="rounded border border-amber-300 bg-amber-50 px-2 py-1 text-amber-900">Includes simulated readings</span>}{image && <span className="rounded border border-green-300 bg-green-50 px-2 py-1 text-green-900">Image observation included</span>}</div>
        <div className="mt-4 grid grid-cols-2 gap-4 sm:grid-cols-4">{analysis.inputs.map((input) => <div key={input.metric}><p className="text-xs capitalize text-zinc-700">{readable(input.metric)}</p><p className="mt-1 font-semibold">{input.value.toFixed(1)} {input.unit}</p><p className="mt-1 text-xs capitalize text-zinc-700">{input.source}{input.is_stale ? " · stale" : ""}</p></div>)}</div>
        {analysis.missing_metrics.length > 0 && <p className="mt-4 text-sm text-amber-900">Missing: {analysis.missing_metrics.map(readable).join(", ")}</p>}
        {analysis.stale_metrics.length > 0 && <p className="mt-2 text-sm text-amber-900">Stale: {analysis.stale_metrics.map(readable).join(", ")}</p>}
        <p className="mt-4 text-sm font-semibold">XGBoost crop suitability</p>{analysis.model.status === "predicted" ? <div className="mt-2 flex flex-wrap gap-4">{analysis.model.predictions.map((prediction) => <span key={prediction.crop} className="text-sm capitalize">{prediction.crop} <strong>{percent(prediction.confidence)}</strong></span>)}</div> : <p className="mt-2 text-sm text-zinc-700">{analysis.model.reason}</p>}
      </>}
    </section>
    <Tabs value={tab} onValueChange={setTab}><TabsList className="mb-6 flex h-auto w-full flex-wrap justify-start gap-1 sm:w-fit"><TabsTrigger value="images"><Camera className="size-4" />Crop health</TabsTrigger><TabsTrigger value="advice"><Leaf className="size-4" />Suggestions</TabsTrigger><TabsTrigger value="chat"><MessageCircle className="size-4" />Ask AgriSense</TabsTrigger></TabsList>
      <TabsContent value="images" className="space-y-6">
        <div className="grid gap-6 xl:grid-cols-2"><section className="space-y-4"><h3 className="font-semibold">Plant camera</h3><Label htmlFor="camera-snapshot">ESP32-CAM snapshot URL</Label><div className="flex flex-wrap gap-2"><Input id="camera-snapshot" value={cameraUrl} onChange={(event) => setCameraUrl(event.target.value)} placeholder="http://camera-address/capture" className="min-w-0 flex-1" disabled={locked} /><Button disabled={locked || !cameraUrl.trim()} onClick={captureCamera}><Camera className="size-4" />Capture</Button></div><p className="text-xs leading-5 text-zinc-700">Hardware connection not verified. Camera must provide a browser-accessible JPEG snapshot with CORS enabled.</p></section>
          <section className="space-y-4"><h3 className="font-semibold">Plant photo</h3><div className="flex flex-wrap gap-3"><label className={`inline-flex min-h-10 cursor-pointer items-center gap-2 rounded-md border border-zinc-300 bg-white px-4 text-sm font-medium ${locked ? "pointer-events-none opacity-50" : ""}`}><ImagePlus className="size-4" />Upload image<input aria-label="Upload plant image" className="sr-only" type="file" accept="image/jpeg,image/png,image/webp" disabled={locked} onChange={(event) => { const file = event.target.files?.[0]; if (file) void processImage(file, "upload"); event.target.value = ""; }} /></label><label className={`inline-flex min-h-10 cursor-pointer items-center gap-2 rounded-md border border-zinc-300 bg-white px-4 text-sm font-medium ${locked ? "pointer-events-none opacity-50" : ""}`}><Camera className="size-4" />Take photo<input aria-label="Take plant photo" className="sr-only" type="file" accept="image/jpeg,image/png,image/webp" capture="environment" disabled={locked} onChange={(event) => { const file = event.target.files?.[0]; if (file) void processImage(file, "camera"); event.target.value = ""; }} /></label></div><p className="text-xs text-zinc-700">JPEG, PNG or WebP · up to 10 MB</p></section></div>
        <label className="flex w-fit items-center gap-3 text-sm"><input type="checkbox" className="size-4 accent-green-700" checked={monitoring} disabled={!cameraUrl.trim()} onChange={(event) => setMonitoring(event.target.checked)} />Camera monitoring · every 30 seconds</label>
        {imageBusy && <p role="status" className="flex items-center gap-2 text-sm"><LoaderCircle className="size-4 animate-spin" />Loading models and analyzing image...</p>}
        {imageError && <ErrorNotice message={imageError} />}
        {image && <div className="grid items-start gap-7 lg:grid-cols-2"><div className="relative mx-auto w-full max-w-lg overflow-hidden rounded-md bg-zinc-100" style={{ aspectRatio: aspect }}><Image src={preview} alt="Analyzed plant with detected leaf regions" fill unoptimized sizes="(max-width: 1024px) 90vw, 512px" className="object-contain" />{detections.map((detection, index) => <div key={index} className="pointer-events-none absolute border-2 border-yellow-400" title={`${detection.label}: ${percent(detection.confidence)}`} style={{ left: `${detection.box[0] * 100}%`, top: `${detection.box[1] * 100}%`, width: `${(detection.box[2] - detection.box[0]) * 100}%`, height: `${(detection.box[3] - detection.box[1]) * 100}%` }} />)}</div><section><div className="flex items-center justify-between gap-3"><h3 className="font-semibold">Image observations</h3><Button size="icon" variant="outline" disabled={locked} onClick={clearImage} title="Clear image observation" aria-label="Clear image observation"><Trash2 /></Button></div><p className="mt-2 text-xs capitalize text-zinc-700">{image.source} · {new Date(image.captured_at).toLocaleString()}</p><p className="mt-5 text-sm font-semibold">MobileNet classifier · center crop</p><ul className="mt-3 space-y-3">{image.classifications.map((prediction) => <li key={prediction.label} className="flex justify-between gap-4 text-sm"><span className="break-words">{readable(prediction.label)}</span><strong className="shrink-0">{percent(prediction.confidence)}</strong></li>)}</ul><p className="mt-5 text-sm font-semibold">YOLO leaf detections</p>{detections.length ? <ul className="mt-3 space-y-2">{detections.map((detection, index) => <li key={index} className="flex justify-between gap-4 text-sm"><span>{readable(detection.label)}</span><span>{percent(detection.confidence)}</span></li>)}</ul> : <p className="mt-2 text-sm text-zinc-700">No detection above the 25% score threshold. This does not confirm a healthy plant.</p>}<p className="mt-5 text-xs leading-5 text-amber-900">Unverified model predictions, not a diagnosis. Scores are not disease probabilities. Unsupported photos can still receive a class label. Field accuracy is not established.</p><Button className="mt-5" onClick={() => { setTab("advice"); void getAdvice(); }} disabled={locked}><Leaf className="size-4" />Get suggestions</Button></section></div>}
      </TabsContent>
      <TabsContent value="advice" className="space-y-5"><div className="flex flex-wrap items-center justify-between gap-3"><h3 className="font-semibold">Farm suggestions</h3><Button disabled={locked} onClick={getAdvice}>{adviceBusy ? <LoaderCircle className="size-4 animate-spin" /> : <RefreshCw className="size-4" />}{advice ? "Refresh suggestions" : "Generate suggestions"}</Button></div>{adviceBusy && <p role="status" className="text-sm">Reviewing current farm context...</p>}{adviceError && <ErrorNotice message={adviceError} />}{!advice && !adviceBusy && <p className="py-8 text-sm text-zinc-700">No suggestions generated yet.</p>}{advice && <><p className="max-w-3xl text-sm leading-7">{advice.summary}</p>{advice.uses_simulated_data && <p className="text-sm font-medium text-amber-900">Advice includes simulated readings. Verify with measurements.</p>}<div className="divide-y divide-zinc-200">{advice.recommendations.map((item, index) => <article className="py-5" key={index}><div className="flex flex-wrap items-center gap-3"><span className="rounded border border-zinc-300 px-2 py-1 text-xs font-semibold uppercase">{item.priority}</span><h4 className="font-semibold">{item.title}</h4></div><p className="mt-3 text-sm leading-6">{item.action}</p><p className="mt-2 text-sm leading-6 text-zinc-700">{item.reason}</p><p className="mt-3 text-sm leading-6 text-amber-900"><strong>Precaution:</strong> {item.precaution}</p></article>)}</div>{advice.follow_up_measurements.length > 0 && <div><h4 className="font-semibold">Follow-up measurements</h4><ul className="mt-3 list-inside list-disc space-y-2 text-sm">{advice.follow_up_measurements.map((measurement, index) => <li key={index}>{measurement}</li>)}</ul></div>}<p className="text-xs leading-5 text-zinc-700">{advice.model} · {advice.disclaimer}</p></>}</TabsContent>
      <TabsContent value="chat"><div className="flex items-center justify-between gap-3"><h3 className="font-semibold">Ask AgriSense</h3><Button variant="outline" size="icon" onClick={() => { setMessages([]); setChatNotice(""); setChatError(""); }} disabled={chatBusy || messages.length === 0} aria-label="Clear conversation" title="Clear conversation"><Trash2 /></Button></div><div className="mt-4 h-[360px] overflow-y-auto rounded-md border border-zinc-200 bg-white p-4 sm:p-6" role="log" aria-live="polite" aria-label="Farm conversation">{messages.length === 0 && <div className="flex h-full flex-col items-center justify-center gap-3 text-center"><MessageCircle className="size-8 text-green-700" /><p className="text-sm text-zinc-700">What would you like to know about your farm?</p></div>}{messages.map((message, index) => <div key={index} className={`mb-6 max-w-3xl ${message.role === "user" ? "ml-auto border-l-2 border-green-600 pl-4" : ""}`}><p className="mb-2 text-xs font-semibold text-green-800">{message.role === "user" ? "You" : "AgriSense AI"}</p><p className="whitespace-pre-wrap break-words text-sm leading-7">{message.text}</p></div>)}{chatBusy && <p role="status" className="flex items-center gap-2 text-sm"><LoaderCircle className="size-4 animate-spin" />AgriSense is responding...</p>}<div ref={chatEnd} /></div>{chatError && <ErrorNotice message={chatError} />}<form className="mt-4 space-y-2" onSubmit={sendMessage}><Label htmlFor="farm-question">Your question</Label><div className="flex items-end gap-2"><textarea id="farm-question" className="min-h-24 min-w-0 flex-1 resize-y rounded-md border border-zinc-300 bg-white p-3 text-sm text-zinc-900" placeholder="Ask about crop care, soil, irrigation or leaf symptoms..." value={question} onChange={(event) => setQuestion(event.target.value)} maxLength={1500} disabled={chatBusy} /><Button type="submit" size="icon" disabled={locked || !question.trim()} title="Send question" aria-label="Send question"><Send /></Button></div><p className="text-right text-xs text-zinc-700">{question.length}/1500</p></form><p className="mt-3 text-xs leading-5 text-zinc-700">{chatNotice || "AI-generated guidance. Verify critical actions with local agronomy expertise."} Conversation and image context reset when you leave this page or switch farms.</p></TabsContent>
    </Tabs>
  </div>;
}

function ErrorNotice({ message }: { message: string }) {
  return <p role="alert" className="mt-3 rounded-md border border-red-200 bg-red-50 p-3 text-sm leading-6 text-red-800">{message}</p>;
}