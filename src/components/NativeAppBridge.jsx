import { useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { Capacitor } from "@capacitor/core";
import { App } from "@capacitor/app";

// Two things the WebView doesn't give you for free on native Android:
//
// 1. Hardware/gesture back button. Capacitor's default is roughly "go back
//    in the WebView's history, else exit" — but on a fresh SPA session the
//    history stack is thin, so it reads as the back button acting like a
//    home/exit button on most pages instead of stepping back one screen.
//    idx > 0 on history.state (react-router's own bookkeeping) tells us
//    whether there's actually somewhere in-app to go back to.
// 2. App Links. A link opened from Gmail (e.g. the signup confirmation
//    email) normally opens in Chrome even with an intent-filter declared —
//    Android only routes it to this app once the domain's
//    /.well-known/assetlinks.json has been verified. Once that's set up,
//    Android hands the URL to this app instead via appUrlOpen, and this
//    turns it into an in-app route instead of trying to load the real
//    website inside the bundled WebView.
export default function NativeAppBridge() {
  const navigate = useNavigate();

  useEffect(() => {
    if (Capacitor.getPlatform() !== "android") return;

    const backSub = App.addListener("backButton", () => {
      if (window.history.state?.idx > 0) {
        navigate(-1);
      } else {
        App.minimizeApp();
      }
    });

    const urlSub = App.addListener("appUrlOpen", ({ url }) => {
      try {
        const parsed = new URL(url);
        navigate(parsed.pathname + parsed.search + parsed.hash);
      } catch {
        // not a URL we can route internally — ignore
      }
    });

    return () => {
      backSub.then((s) => s.remove());
      urlSub.then((s) => s.remove());
    };
  }, [navigate]);

  return null;
}
