import React, { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/lib/AuthContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { ArrowLeft, Loader2, LifeBuoy, ChevronDown, Send, CheckCircle2 } from "lucide-react";

const FAQS = [
  { q: "How do I track my delivery?", a: "Open the request from your Trips list — its status updates live from pickup through to delivery." },
  { q: "How do I pay for a delivery?", a: "MoveZW currently supports cash on delivery. Secure online payments are coming soon." },
  { q: "How are drivers verified?", a: "Every driver submits a National ID, driver's licence and vehicle registration, which our admin team reviews before approval." },
  { q: "Can I cancel a request?", a: "Yes — you can cancel an open request any time before a driver is en route to pickup." },
  { q: "How do I become a driver?", a: "Sign up as a driver and complete onboarding. After admin verification you'll start receiving job requests." },
];

export default function Support() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [subject, setSubject] = useState("");
  const [message, setMessage] = useState("");
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState(false);
  const [openFaq, setOpenFaq] = useState(0);

  const submit = async (e) => {
    e.preventDefault();
    setSending(true);
    // No backend email service is connected yet, so this opens the user's own
    // mail app with the message pre-filled rather than sending silently.
    const body = `From: ${user?.full_name || "User"} (${user?.email || "—"})\n\n${message}`;
    const mailto = `mailto:support@movezw.co.zw?subject=${encodeURIComponent(`Support: ${subject || "MoveZW enquiry"}`)}&body=${encodeURIComponent(body)}`;
    window.location.href = mailto;
    setSent(true);
    setSubject("");
    setMessage("");
    setSending(false);
  };

  return (
    <div className="p-4 pb-8">
      <button onClick={() => navigate(-1)} className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground mb-4">
        <ArrowLeft className="w-4 h-4" /> Back
      </button>
      <h1 className="text-2xl font-bold tracking-tight mb-1">Support Center</h1>
      <p className="text-sm text-muted-foreground mb-6">Find quick answers or reach out to our team.</p>

      <div className="bg-white rounded-2xl border border-border p-4 mb-6">
        <h2 className="text-sm font-semibold flex items-center gap-2 mb-3"><LifeBuoy className="w-4 h-4 text-primary" /> Common questions</h2>
        <div className="space-y-2">
          {FAQS.map((item, i) => {
            const isOpen = openFaq === i;
            return (
              <div key={item.q} className="rounded-xl border border-border overflow-hidden">
                <button
                  className="w-full flex items-center justify-between gap-3 px-3 py-3 text-left"
                  onClick={() => setOpenFaq(isOpen ? -1 : i)}
                >
                  <span className="text-sm font-medium text-foreground">{item.q}</span>
                  <ChevronDown className={`w-4 h-4 text-muted-foreground shrink-0 transition-transform ${isOpen ? "rotate-180" : ""}`} />
                </button>
                {isOpen && <p className="px-3 pb-3 text-sm text-muted-foreground leading-relaxed">{item.a}</p>}
              </div>
            );
          })}
        </div>
      </div>

      <div className="bg-white rounded-2xl border border-border p-4">
        <h2 className="text-sm font-semibold mb-1">Still need help?</h2>
        <p className="text-xs text-muted-foreground mb-4">Send us a message and we'll get back to you.</p>

        {sent ? (
          <div className="flex flex-col items-center text-center py-6">
            <CheckCircle2 className="w-10 h-10 text-emerald-500 mb-2" />
            <p className="text-sm font-medium text-foreground">Your email app should have opened</p>
            <p className="text-xs text-muted-foreground mt-1">Send it from there and our team will reply as soon as they can.</p>
            <Button variant="outline" size="sm" className="mt-4" onClick={() => setSent(false)}>Send another</Button>
          </div>
        ) : (
          <form onSubmit={submit} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="subject">Subject</Label>
              <Input id="subject" value={subject} onChange={(e) => setSubject(e.target.value)} placeholder="What do you need help with?" required />
            </div>
            <div className="space-y-2">
              <Label htmlFor="message">Message</Label>
              <Textarea id="message" value={message} onChange={(e) => setMessage(e.target.value)} rows={5} placeholder="Describe your issue..." required />
            </div>
            <Button type="submit" className="w-full h-12" disabled={sending}>
              {sending ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" />Sending...</> : <><Send className="w-4 h-4 mr-2" />Send message</>}
            </Button>
          </form>
        )}
      </div>
    </div>
  );
}
