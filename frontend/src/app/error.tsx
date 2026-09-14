"use client";

import { RefreshCw, Sprout } from "lucide-react";
import { Button } from "@/components/ui/button";

export default function ErrorPage({ reset }: { reset: () => void }) {
  return <main className="flex min-h-screen flex-col items-center justify-center gap-5 px-6 text-center"><Sprout className="size-10 text-primary" /><h1 className="text-2xl font-semibold">We couldn&apos;t load your workspace.</h1><p className="max-w-md text-sm text-zinc-600">The account service may be temporarily unavailable. Please try again shortly.</p><Button onClick={reset}><RefreshCw className="size-4" />Try again</Button></main>;
}