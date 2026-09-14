import { Sprout } from "lucide-react";
import { cn } from "@/lib/utils";

export function Brand({ light = false }: { light?: boolean }) {
  return <span className={cn("inline-flex items-center gap-2.5 text-[22px] font-semibold", light ? "text-white" : "text-[#183e2e]")}><span className={cn("flex size-9 items-center justify-center rounded-lg", light ? "bg-white/15" : "bg-primary text-white")}><Sprout className="size-6" strokeWidth={1.8} /></span>AgriSense<span className={cn("-ml-1 mb-4 size-1.5 rounded-full", light ? "bg-lime-300" : "bg-primary")} /></span>;
}