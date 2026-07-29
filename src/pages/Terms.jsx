import React from "react";
import { Link } from "react-router-dom";
import { Truck, ArrowLeft, ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/button";

const SECTIONS = [
  {
    title: "1. Acceptance of Terms",
    body: "By creating an account or using the MoveZW platform, you agree to be bound by these Terms of Service. If you do not agree with any part of these terms, you must not use the platform.",
  },
  {
    title: "2. Description of Service",
    body: "MoveZW is a marketplace that connects customers who need goods transported with independent transport providers (drivers). MoveZW facilitates the connection but is not itself a transport provider and does not take possession of any goods.",
  },
  {
    title: "3. User Accounts",
    body: "You must provide accurate and complete information when registering. You are responsible for keeping your account credentials secure and for all activity under your account. You must be at least 18 years old to use MoveZW.",
  },
  {
    title: "4. Customer Responsibilities",
    body: "Customers agree to provide truthful descriptions of cargo, pickup and destination details, and a fair budget. Customers must ensure goods are lawful to transport and are responsible for ensuring items are ready for pickup at the agreed time.",
  },
  {
    title: "5. Driver Responsibilities",
    body: "Drivers must hold a valid driver's licence and submit truthful vehicle and identity documents for verification. Drivers are independent contractors, not employees of MoveZW, and are responsible for the safe and lawful transport of goods.",
  },
  {
    title: "6. Verification & Listings",
    body: "MoveZW reviews submitted documents before approving drivers. Approval does not guarantee the quality of any individual service. Drivers and customers are responsible for their own conduct during a job.",
  },
  {
    title: "7. Payments",
    body: "MoveZW currently facilitates cash-on-delivery payments directly between customers and drivers. Additional payment methods may be introduced. Any platform service fees will be clearly disclosed before they apply.",
  },
  {
    title: "8. Cancellations & Disputes",
    body: "Either party may cancel an open request before a driver is en route to pickup. For disputes, users should first attempt to resolve directly, then contact MoveZW support. MoveZW may mediate but is not liable for the outcome.",
  },
  {
    title: "9. Prohibited Conduct",
    body: "Users must not use MoveZW to transport illegal, hazardous or stolen goods, to harass others, to circumvent the platform's processes, or to misrepresent themselves or their vehicles.",
  },
  {
    title: "10. Limitation of Liability",
    body: "MoveZW provides the platform 'as is' and is not liable for loss or damage to goods, delays, or the conduct of other users. Liability is limited to the maximum extent permitted by applicable Zimbabwean law.",
  },
  {
    title: "11. Changes to Terms",
    body: "MoveZW may update these Terms from time to time. Continued use of the platform after changes constitutes acceptance of the revised Terms. Material changes will be communicated to active users.",
  },
  {
    title: "12. Contact",
    body: "Questions about these Terms can be sent to support@movezw.co.zw or through the in-app Support Center.",
  },
];

export default function Terms() {
  return (
    <div className="min-h-screen bg-gradient-to-b from-blue-50 to-background">
      <header className="sticky top-0 z-30 bg-white/90 backdrop-blur-md border-b border-border">
        <div className="max-w-3xl mx-auto px-4 h-16 flex items-center justify-between">
          <Link to="/landing" className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-xl bg-primary flex items-center justify-center">
              <Truck className="w-5 h-5 text-primary-foreground" />
            </div>
            <span className="font-bold text-lg tracking-tight text-foreground">MoveZW</span>
          </Link>
          <Link to="/landing">
            <Button variant="ghost" size="sm"><ArrowLeft className="w-4 h-4 mr-1" /> Home</Button>
          </Link>
        </div>
      </header>

      <main className="max-w-3xl mx-auto px-4 sm:px-6 py-10">
        <div className="flex items-center gap-2 text-primary text-sm font-medium mb-2">
          <ShieldCheck className="w-4 h-4" /> Legal
        </div>
        <h1 className="text-3xl sm:text-4xl font-bold tracking-tight text-foreground">Terms of Service</h1>
        <p className="mt-3 text-sm text-muted-foreground">Last updated: July 2026</p>

        <div className="mt-8 space-y-6">
          {SECTIONS.map((s) => (
            <section key={s.title} className="bg-card rounded-2xl border border-border p-5 sm:p-6 shadow-sm">
              <h2 className="font-heading text-base sm:text-lg font-semibold text-foreground mb-2">{s.title}</h2>
              <p className="text-sm sm:text-base text-muted-foreground leading-relaxed">{s.body}</p>
            </section>
          ))}
        </div>

        <div className="mt-10 text-center">
          <Link to="/support">
            <Button variant="outline">Questions? Contact support</Button>
          </Link>
        </div>
      </main>
    </div>
  );
}
