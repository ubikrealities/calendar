"use client";

import { useSearchParams } from "next/navigation";

const SITE_URL = "https://ouigrowth.com";

// OuiGrowth nav pill + footer around public booking pages.
// Hidden in ?embed=true so iframes on ouigrowth.com don't double the chrome.
export function BrandHeader() {
  const isEmbed = useSearchParams().get("embed") === "true";
  if (isEmbed) return null;

  return (
    <header className="flex justify-center px-4 pt-6">
      <nav className="flex w-full max-w-2xl items-center justify-between gap-4 rounded-2xl border border-white/[0.08] bg-[rgba(13,13,13,0.8)] px-4 py-2.5 backdrop-blur-xl">
        <a href={SITE_URL} className="flex items-center gap-2.5">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/brand/ouigrowth-logo.png" alt="OuiGrowth" className="h-6 w-auto" />
          <span className="text-[15px] font-semibold tracking-tight">OuiGrowth</span>
        </a>
        <a
          href={SITE_URL}
          className="text-sm text-muted-foreground transition-colors hover:text-foreground"
        >
          ouigrowth.com ↗
        </a>
      </nav>
    </header>
  );
}

export function BrandFooter() {
  const isEmbed = useSearchParams().get("embed") === "true";
  if (isEmbed) return null;

  return (
    <footer className="pb-8 pt-2 text-center text-xs text-[#5e5e5e]">
      © {new Date().getFullYear()} OuiGrowth · The PPC alt-agency
    </footer>
  );
}
