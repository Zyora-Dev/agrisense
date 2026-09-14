import { Sprout } from "lucide-react";

export default function Loading() {
  return <main className="flex min-h-screen items-center justify-center" role="status"><div className="flex flex-col items-center gap-4"><Sprout className="size-9 animate-pulse text-primary" /><span className="text-sm text-zinc-600">Opening your workspace...</span></div></main>;
}