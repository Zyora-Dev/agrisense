"use client";

import { FormEvent, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { Dialog } from "radix-ui";
import { ExternalLink, LoaderCircle, MessageCircle, Minus, RefreshCw, Send, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import type { Farm } from "@/lib/auth";

type Message = { role: "user" | "assistant"; text: string };
type Conversation = { messages: Message[]; draft: string; notice: string };
const emptyConversation: Conversation = { messages: [], draft: "", notice: "" };
const workspacePaths = ["/dashboard", "/farms", "/weather", "/readings", "/assistant", "/marketplace", "/settings"];

export function FloatingAssistant() {
  const pathname = usePathname();
  return workspacePaths.some((path) => pathname === path || pathname.startsWith(`${path}/`)) ? <FarmChatWidget /> : null;
}

function FarmChatWidget() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [farms, setFarms] = useState<Farm[]>([]);
  const [farmId, setFarmId] = useState("");
  const [conversations, setConversations] = useState<Record<string, Conversation>>({});
  const [loading, setLoading] = useState(true);
  const [refresh, setRefresh] = useState(0);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const request = useRef<AbortController | null>(null);
  const messageList = useRef<HTMLDivElement>(null);
  const conversation = conversations[farmId] ?? emptyConversation;

  useEffect(() => () => request.current?.abort(), []);

  useEffect(() => {
    if (!open) return;
    const controller = new AbortController();
    async function load() {
      setLoading(true); setError("");
      try {
        const response = await fetch("/api/farms", { cache: "no-store", signal: controller.signal });
        if (response.status === 401) { router.push("/login"); return; }
        const data = await response.json();
        if (!response.ok) throw new Error(data.error ?? data.detail ?? "Unable to load farms.");
        if (!controller.signal.aborted) {
          setFarms(data);
          setFarmId((current) => data.some((farm: Farm) => farm.id === current) ? current : data[0]?.id ?? "");
          setConversations((current) => Object.fromEntries(Object.entries(current).filter(([id]) => data.some((farm: Farm) => farm.id === id))));
        }
      } catch (failure) { if (!controller.signal.aborted) setError((failure as Error).message); }
      finally { if (!controller.signal.aborted) setLoading(false); }
    }
    void load();
    return () => controller.abort();
  }, [open, refresh, router]);

  useEffect(() => {
    const list = messageList.current;
    if (open && list) list.scrollTop = list.scrollHeight;
  }, [open, conversation.messages, busy]);

  function updateConversation(update: Partial<Conversation>) {
    setConversations((current) => ({ ...current, [farmId]: { ...(current[farmId] ?? emptyConversation), ...update } }));
  }

  async function send(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const text = conversation.draft.trim();
    if (!text || !farmId || busy || loading || request.current) return;
    const controller = new AbortController();
    request.current = controller;
    setBusy(true); setError("");
    try {
      const response = await fetch(`/api/farms/${farmId}/chat`, {
        method: "POST", headers: { "Content-Type": "application/json" }, signal: controller.signal,
        body: JSON.stringify({ message: text, history: conversation.messages.slice(-12).map((message) => ({ ...message, text: message.text.slice(0, 1500) })) }),
      });
      if (response.status === 401) { router.push("/login"); return; }
      const data = await response.json();
      if (!response.ok) throw new Error(typeof data.detail === "string" ? data.detail : data.error ?? "Unable to send. Please try again.");
      if (!controller.signal.aborted) updateConversation({
        messages: [...conversation.messages, { role: "user", text }, { role: "assistant", text: data.answer }],
        draft: "", notice: `${data.uses_simulated_data ? "Includes simulated readings. " : ""}${data.disclaimer}`,
      });
    } catch (failure) { if (!controller.signal.aborted) setError((failure as Error).message); }
    finally { request.current = null; if (!controller.signal.aborted) setBusy(false); }
  }

  return <Dialog.Root open={open} onOpenChange={setOpen} modal={false}>
    <Dialog.Trigger asChild><Button size="icon" className="fixed right-5 bottom-5 z-40 size-14 rounded-full bg-green-800 text-white shadow-lg hover:bg-green-900" aria-label="Open floating farm assistant" title="Ask AgriSense"><MessageCircle className="size-6" />{busy && <span className="absolute -top-1 -right-1 size-3 animate-pulse rounded-full bg-lime-400" />}</Button></Dialog.Trigger>
    <Dialog.Portal><Dialog.Content aria-describedby="floating-chat-description" onInteractOutside={(event) => event.preventDefault()} className="fixed right-4 bottom-22 z-40 flex h-[36rem] max-h-[calc(100dvh-7rem)] w-[calc(100vw-2rem)] flex-col overflow-hidden rounded-lg border border-green-200 bg-white text-zinc-900 shadow-xl outline-none sm:w-[420px]">
      <header className="flex shrink-0 items-center justify-between gap-2 border-b bg-green-50 px-4 py-3">
        <Dialog.Title className="flex items-center gap-2 font-semibold"><MessageCircle className="size-5 text-green-800" />Ask AgriSense</Dialog.Title>
        <div className="flex gap-1">
          <Button asChild size="icon" variant="ghost" title="Open full farm assistant"><Link href="/assistant" aria-label="Open full farm assistant" onClick={() => setOpen(false)}><ExternalLink className="size-4" /></Link></Button>
          <Button size="icon" variant="ghost" title="Clear widget conversation" aria-label="Clear widget conversation" disabled={busy || !conversation.messages.length} onClick={() => { updateConversation(emptyConversation); setError(""); }}><Trash2 className="size-4" /></Button>
          <Dialog.Close asChild><Button size="icon" variant="ghost" title="Minimize chat" aria-label="Minimize chat"><Minus className="size-4" /></Button></Dialog.Close>
        </div>
      </header>
      <div className="shrink-0 space-y-2 border-b px-4 py-3">
        <div className="flex items-center gap-2"><Label htmlFor="floating-chat-farm">Farm</Label><select id="floating-chat-farm" className="h-9 min-w-0 flex-1 rounded-md border bg-white px-2 text-sm" disabled={loading || busy || !farms.length} value={farmId} onChange={(event) => { setFarmId(event.target.value); setError(""); }}>{!farms.length && <option value="">{loading ? "Loading farms..." : "No farms"}</option>}{farms.map((farm) => <option key={farm.id} value={farm.id}>{farm.name}</option>)}</select><Button variant="ghost" size="icon" disabled={loading || busy} aria-label="Refresh chat farms" title="Refresh farms" onClick={() => setRefresh((value) => value + 1)}><RefreshCw className="size-4" /></Button></div>
        <Dialog.Description id="floating-chat-description" className="text-xs text-zinc-700">Farm report context. No photo attached.</Dialog.Description>
      </div>
      <div ref={messageList} role="log" aria-label="Floating farm conversation" aria-live="polite" className="min-h-0 flex-1 space-y-5 overflow-y-auto overscroll-contain px-4 py-5">
        {loading && <p role="status" className="text-sm">Loading farms...</p>}
        {!loading && !farms.length && !error && <div className="space-y-3"><p className="text-sm">No farms registered.</p><Button asChild variant="outline"><Link href="/farms" onClick={() => setOpen(false)}>Add farm</Link></Button></div>}
        {!loading && farmId && !conversation.messages.length && <p className="text-sm text-zinc-700">What would you like to know about your farm?</p>}
        {conversation.messages.map((message, index) => <div key={index} className={message.role === "user" ? "border-l-2 border-green-600 pl-3" : ""}><p className="mb-1 text-xs font-semibold text-green-800">{message.role === "user" ? "You" : "AgriSense AI"}</p><p className="whitespace-pre-wrap text-sm leading-6 [overflow-wrap:anywhere]">{message.text}</p></div>)}
        {busy && <p role="status" className="flex items-center gap-2 text-sm"><LoaderCircle className="size-4 animate-spin" />AgriSense is responding...</p>}
        {conversation.notice && <p className="text-xs leading-5 text-zinc-700">{conversation.notice}</p>}
      </div>
      <form onSubmit={send} className="shrink-0 space-y-2 border-t px-4 py-3">
        {error && <p role="alert" className="text-sm text-red-800">{error}</p>}
        <Label htmlFor="floating-chat-question">Your question</Label>
        <div className="flex items-end gap-2"><textarea id="floating-chat-question" rows={2} maxLength={1500} value={conversation.draft} disabled={busy || loading || !farmId} onChange={(event) => updateConversation({ draft: event.target.value })} className="min-w-0 flex-1 resize-none rounded-md border bg-white p-2 text-sm text-zinc-900" placeholder="Ask about your farm..." /><Button type="submit" size="icon" disabled={busy || loading || !farmId || !conversation.draft.trim()} aria-label="Send widget question" title="Send question"><Send className="size-4" /></Button></div>
      </form>
    </Dialog.Content></Dialog.Portal>
  </Dialog.Root>;
}