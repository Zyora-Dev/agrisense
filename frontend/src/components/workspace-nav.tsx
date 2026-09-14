"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { CloudSun, Cpu, LayoutDashboard, MessageCircle, Settings, Store, TestTubes } from "lucide-react";

const navigation = [
  { label: "Overview", icon: LayoutDashboard, href: "/dashboard" },
  { label: "Farms & devices", icon: Cpu, href: "/farms" },
  { label: "Weather", icon: CloudSun, href: "/weather" },
  { label: "Farm assistant", icon: MessageCircle, href: "/assistant" },
  { label: "Field readings", icon: TestTubes, href: "/readings" },
  { label: "Marketplace", icon: Store, href: "/marketplace" },
  { label: "Settings", icon: Settings, href: "/settings" },
];

export function WorkspaceNav() {
  const pathname = usePathname();
  return (
    <nav className="mt-9 space-y-1" aria-label="Workspace navigation">
      {navigation.map(({ label, icon: Icon, href }) => {
        const active = href !== "#" && pathname.startsWith(href);
        return (
          <Link key={label} href={href} className={`nav-item ${active ? "is-active" : ""}`} aria-current={active ? "page" : undefined}>
            <Icon className="size-[18px]" strokeWidth={1.8} />{label}
          </Link>
        );
      })}
    </nav>
  );
}