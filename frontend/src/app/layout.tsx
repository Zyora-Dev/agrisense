import type { Metadata } from "next";
import "@fontsource/inter/400.css";
import "@fontsource/inter/500.css";
import "@fontsource/inter/600.css";
import "@fontsource/inter/700.css";
import { TooltipProvider } from "@/components/ui/tooltip";
import { FloatingAssistant } from "@/components/floating-assistant";
import "./globals.css";

export const metadata: Metadata = {
  title: "AgriSense | Your Farm, In Focus",
  description: "Your AgriSense farming workspace.",
  robots: { index: false, follow: false },
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className="h-full antialiased">
      <body className="min-h-full" suppressHydrationWarning>
        <TooltipProvider>{children}<FloatingAssistant /></TooltipProvider>
      </body>
    </html>
  );
}
