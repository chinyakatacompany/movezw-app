import React, { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Truck, Menu, X, Download } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useInstallPrompt } from "@/lib/useInstallPrompt";

const NAV_LINKS = [
  { label: "How it works", href: "#how-it-works" },
  { label: "Why MoveZW", href: "#why" },
  { label: "FAQ", href: "#faq" },
];

export default function LandingNav() {
  const [open, setOpen] = useState(false);
  const [scrolled, setScrolled] = useState(false);
  const { canInstall, promptInstall } = useInstallPrompt();

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 8);
    onScroll();
    window.addEventListener("scroll", onScroll);
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  return (
    <header
      className={`fixed top-0 inset-x-0 z-50 transition-colors ${
        scrolled ? "bg-card/90 backdrop-blur-md border-b border-border shadow-sm" : "bg-transparent"
      }`}
    >
      <nav className="max-w-6xl mx-auto px-4 sm:px-6 h-16 flex items-center justify-between">
        <Link to="/landing" className="flex items-center gap-2">
          <div className="w-9 h-9 rounded-xl bg-primary flex items-center justify-center shadow-sm">
            <Truck className="w-4 h-4 text-primary-foreground" />
          </div>
          <span className="font-bold text-xl tracking-tight text-foreground">MoveZW</span>
        </Link>

        <div className="hidden md:flex items-center gap-8">
          {NAV_LINKS.map((l) => (
            <a
              key={l.href}
              href={l.href}
              className="text-sm font-medium text-muted-foreground hover:text-foreground transition-colors"
            >
              {l.label}
            </a>
          ))}
        </div>

        <div className="hidden md:flex items-center gap-3">
          {canInstall && (
            <button
              onClick={promptInstall}
              className="inline-flex items-center gap-1.5 h-9 px-4 rounded-full bg-accent text-accent-foreground text-sm font-semibold shadow-md shadow-accent/25 hover:bg-accent/90 transition-colors"
            >
              <Download className="w-4 h-4" /> Install app
            </button>
          )}
          <Link to="/login">
            <Button variant="outline" size="sm">Log in</Button>
          </Link>
          <Link to="/register">
            <Button size="sm">Get started</Button>
          </Link>
        </div>

        <div className="flex items-center gap-1 md:hidden">
          <Link to="/login">
            <Button variant="outline" size="sm">Log in</Button>
          </Link>
          <button
            className="p-2 -mr-2 text-foreground"
            onClick={() => setOpen((v) => !v)}
            aria-label="Toggle menu"
          >
            {open ? <X className="w-6 h-6" /> : <Menu className="w-6 h-6" />}
          </button>
        </div>
      </nav>

      {open && (
        <div className="md:hidden bg-card border-b border-border shadow-lg">
          <div className="px-4 py-4 space-y-1">
            {NAV_LINKS.map((l) => (
              <a
                key={l.href}
                href={l.href}
                onClick={() => setOpen(false)}
                className="block py-2.5 text-sm font-medium text-foreground hover:text-primary"
              >
                {l.label}
              </a>
            ))}
            {canInstall && (
              <button
                onClick={() => { promptInstall(); setOpen(false); }}
                className="w-full mt-1 mb-2 inline-flex items-center justify-center gap-2 h-11 rounded-xl bg-accent text-accent-foreground text-sm font-semibold shadow-md shadow-accent/25 hover:bg-accent/90 transition-colors"
              >
                <Download className="w-4 h-4" /> Install MoveZW app
              </button>
            )}
            <div className="pt-3">
              <Link to="/register" onClick={() => setOpen(false)}>
                <Button className="w-full">Get started</Button>
              </Link>
            </div>
          </div>
        </div>
      )}
    </header>
  );
}
