import React, { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { ArrowRight, Truck, Download, Share, Smartphone, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import LandingNav from "@/components/landing/LandingNav";
import Hero from "@/components/landing/Hero";
import HowItWorks from "@/components/landing/HowItWorks";
import WhyTrustUs from "@/components/landing/WhyTrustUs";
import FAQ from "@/components/landing/FAQ";
import LandingFooter from "@/components/landing/LandingFooter";


function PWAInstallSection() {
  const [deferredPrompt, setDeferredPrompt] = useState(null);
  const [showInstructions, setShowInstructions] = useState(false);
  const [isIOS, setIsIOS] = useState(false);
  const [isInstalled, setIsInstalled] = useState(false);

  useEffect(() => {
    const ua = window.navigator.userAgent || "";
    setIsIOS(/iPad|iPhone|iPod/.test(ua) ||
      (window.navigator.platform === "MacIntel" && window.navigator.maxTouchPoints > 1));
    setIsInstalled(Boolean(window.matchMedia?.("(display-mode: standalone)").matches ||
      window.navigator.standalone === true));

    const onPrompt = (event) => { event.preventDefault(); setDeferredPrompt(event); };
    const onInstalled = () => { setIsInstalled(true); setDeferredPrompt(null); setShowInstructions(false); };
    window.addEventListener("beforeinstallprompt", onPrompt);
    window.addEventListener("appinstalled", onInstalled);
    return () => {
      window.removeEventListener("beforeinstallprompt", onPrompt);
      window.removeEventListener("appinstalled", onInstalled);
    };
  }, []);

  const install = async () => {
    if (deferredPrompt) {
      await deferredPrompt.prompt();
      await deferredPrompt.userChoice;
      setDeferredPrompt(null);
    } else {
      setShowInstructions(true);
    }
  };

  if (isInstalled) return null;
  return (
    <>
      <section className="px-4 py-8 sm:py-10">
        <div className="max-w-5xl mx-auto rounded-2xl border border-primary/15 bg-card p-5 sm:p-7 shadow-sm">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-5">
            <div className="flex items-start gap-4">
              <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary"><Smartphone className="h-6 w-6" /></div>
              <div>
                <h2 className="text-xl sm:text-2xl font-bold">Get MoveZW on your phone</h2>
                <p className="mt-1 max-w-2xl text-sm sm:text-base text-muted-foreground">Add MoveZW to your Home Screen for quick access, just like an app.</p>
              </div>
            </div>
            <Button size="lg" className="h-12 shrink-0 px-6" onClick={install}><Download className="mr-2 h-4 w-4" />Install MoveZW App</Button>
          </div>
        </div>
      </section>
      {showInstructions && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 p-4" onClick={(e) => { if (e.target === e.currentTarget) setShowInstructions(false); }}>
          <div role="dialog" aria-modal="true" aria-labelledby="pwa-install-title" className="w-full max-w-md rounded-2xl bg-background p-6 shadow-xl">
            <div className="flex items-start justify-between gap-4">
              <div><h3 id="pwa-install-title" className="text-xl font-bold">Install MoveZW</h3><p className="mt-1 text-sm text-muted-foreground">{isIOS ? "Follow these steps in Safari to add MoveZW to your iPhone." : "Use your browser menu to add MoveZW to your phone's Home Screen."}</p></div>
              <button type="button" onClick={() => setShowInstructions(false)} aria-label="Close installation instructions" className="rounded-full p-2 hover:bg-muted"><X className="h-5 w-5" /></button>
            </div>
            {isIOS ? (
              <ol className="mt-5 space-y-4 text-sm">
                <li className="flex items-start gap-3"><span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-primary/10 font-semibold text-primary">1</span><span>Open <strong>movezw.co.zw</strong> in <strong>Safari</strong>. If you opened this page in another app, choose Open in Safari.</span></li>
                <li className="flex items-start gap-3"><span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-primary/10 font-semibold text-primary">2</span><span>Tap Safari's <strong>Share</strong> icon <Share className="inline h-4 w-4 align-text-bottom" />.</span></li>
                <li className="flex items-start gap-3"><span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-primary/10 font-semibold text-primary">3</span><span>Scroll down and tap <strong>Add to Home Screen</strong>. If it is not shown, check Edit Actions.</span></li>
                <li className="flex items-start gap-3"><span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-primary/10 font-semibold text-primary">4</span><span>Tap <strong>Add</strong>. The MoveZW icon will appear on your Home Screen.</span></li>
              </ol>
            ) : <ol className="mt-5 space-y-3 text-sm"><li>1. Open MoveZW in your browser, preferably Chrome.</li><li>2. Open the browser menu (usually ⋮).</li><li>3. Choose <strong>Install app</strong> or <strong>Add to Home screen</strong>, then confirm.</li></ol>}
            <Button className="mt-6 w-full" onClick={() => setShowInstructions(false)}>Got it</Button>
          </div>
        </div>
      )}
    </>
  );
}

export default function Landing() {
  return (
    <div className="min-h-screen bg-background">
      <LandingNav />
      <main>
        <Hero />\n        <PWAInstallSection />
        <HowItWorks />
        <WhyTrustUs />
        <FAQ />
        <section className="py-16 sm:py-20 bg-primary text-primary-foreground">
          <div className="max-w-4xl mx-auto px-4 sm:px-6 text-center">
            <h2 className="font-heading text-3xl sm:text-4xl font-bold tracking-tight">
              Ready to move anything, anywhere?
            </h2>
            <p className="mt-3 text-primary-foreground/80 max-w-xl mx-auto">
              Join MoveZW today and connect with trusted drivers across Zimbabwe in minutes.
            </p>
            <div className="mt-8 flex flex-col sm:flex-row gap-3 justify-center">
              <Link to="/register?role=customer">
                <Button size="lg" variant="secondary" className="w-full sm:w-auto h-12 px-7 text-base">
                  Book Transport
                  <ArrowRight className="w-4 h-4" />
                </Button>
              </Link>
              <Link to="/register?role=driver">
                <Button
                  size="lg"
                  variant="outline"
                  className="w-full sm:w-auto h-12 px-7 text-base bg-transparent border-primary-foreground/40 text-primary-foreground hover:bg-primary-foreground/10"
                >
                  <Truck className="w-4 h-4" />
                  Become a Driver
                </Button>
              </Link>
            </div>
          </div>
        </section>
      </main>
      <LandingFooter />
    </div>
  );
}
