import React from "react";
import { Link } from "react-router-dom";
import { Truck, ArrowLeft, ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useSiteContent } from "@/lib/siteContent";

// Defines structure/order/count of sections and their default text. Actual
// rendered text is pulled from site_content via each section's key, so
// admins can edit it at /admin/content without a code change — this array
// only supplies the fallback shown until a section is customized.
export const TERMS_SECTIONS = [
  {
    key: "terms.1",
    title: "1. Acceptance of Terms",
    body: "By creating an account or using the MoveZW platform, you agree to be bound by these Terms of Service. If you do not agree with any part of these terms, you must not use the platform.",
  },
  {
    key: "terms.2",
    title: "2. Description of Service",
    body: "MoveZW is a marketplace that connects customers who need goods transported with independent transport providers (drivers). MoveZW facilitates the connection but is not itself a transport provider and does not take possession of any goods.",
  },
  {
    key: "terms.3",
    title: "3. User Accounts",
    body: "You must provide accurate and complete information when registering. You are responsible for keeping your account credentials secure and for all activity under your account. You must be at least 18 years old to use MoveZW.",
  },
  {
    key: "terms.4",
    title: "4. Customer Responsibilities",
    body: "Customers agree to provide truthful descriptions of cargo, pickup and destination details, and a fair budget. Customers must ensure goods are lawful to transport and are responsible for ensuring items are ready for pickup at the agreed time.",
  },
  {
    key: "terms.5",
    title: "5. Prohibited & Restricted Items",
    body: "MoveZW does not permit the transport of hazardous materials, illegal drugs, weapons or sharp objects, or any other item that could pose a risk to people, property, or other goods travelling in the same vehicle. Where an item is accepted for transport, the customer is responsible for packing it securely enough to prevent injury, damage, leakage, or contamination during the trip.",
  },
  {
    key: "terms.6",
    title: "6. Driver Responsibilities",
    body: "Drivers must hold a valid driver's licence and submit truthful vehicle and identity documents for verification. Drivers are independent contractors, not employees of MoveZW, and are responsible for the safe and lawful transport of goods.",
  },
  {
    key: "terms.7",
    title: "7. Verification & Listings",
    body: "MoveZW reviews submitted documents before approving drivers. Approval does not guarantee the quality of any individual service. Drivers and customers are responsible for their own conduct during a job.",
  },
  {
    key: "terms.8",
    title: "8. Payments",
    body: "MoveZW currently facilitates cash-on-delivery payments directly between customers and drivers, based on the price a driver quotes and the customer accepts for a given job. Additional payment methods may be introduced. Any platform service fees will be clearly disclosed before they apply.",
  },
  {
    key: "terms.9",
    title: "9. Cancellations & Disputes",
    body: "Either party may cancel an open request before a driver is en route to pickup. For disputes, users should first attempt to resolve directly, then contact MoveZW support. MoveZW may mediate but is not liable for the outcome.",
  },
  {
    key: "terms.10",
    title: "10. Governing Law & Dispute Settlement",
    body: "These Terms are governed by the laws of Zimbabwe. Any dispute arising from or in connection with these Terms, or your use of the MoveZW platform, that cannot be resolved directly between the parties or through MoveZW support is subject to the jurisdiction of the courts of Zimbabwe.",
  },
  {
    key: "terms.11",
    title: "11. Prohibited Conduct",
    body: "Users must not use MoveZW to transport illegal, hazardous or stolen goods, to harass others, to circumvent the platform's processes, or to misrepresent themselves or their vehicles.",
  },
  {
    key: "terms.12",
    title: "12. Limitation of Liability",
    body: "MoveZW provides the platform 'as is' and is not liable for loss or damage to goods, delays, or the conduct of other users. Liability is limited to the maximum extent permitted by applicable Zimbabwean law.",
  },
  {
    key: "terms.13",
    title: "13. Force Majeure",
    body: "MoveZW is not liable for any loss, damage, delay, or failure to perform arising from circumstances beyond its reasonable control, including but not limited to acts of God, fire, floods, earthquakes, civil unrest, government action, or other events that could not reasonably have been foreseen or prevented.",
  },
  {
    key: "terms.14",
    title: "14. Severability",
    body: "If any provision of these Terms is found to be invalid or unenforceable, that finding does not affect the validity or enforceability of the remaining provisions, which continue in full force and effect.",
  },
  {
    key: "terms.15",
    title: "15. Changes to Terms",
    body: "MoveZW may update these Terms from time to time. Continued use of the platform after changes constitutes acceptance of the revised Terms. Material changes will be communicated to active users.",
  },
  {
    key: "terms.16",
    title: "16. Contact",
    body: "Questions about these Terms can be sent to movezwsupport@gmail.com or through the in-app Support Center.",
  },
];

export default function Terms() {
  const { t } = useSiteContent();
  return (
    <div className="min-h-screen bg-gradient-to-b from-primary/5 to-background">
      <header className="sticky top-0 z-30 bg-card/90 backdrop-blur-md border-b border-border">
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
          {TERMS_SECTIONS.map((s) => (
            <section key={s.key} className="bg-card rounded-2xl border border-border p-5 sm:p-6 shadow-sm">
              <h2 className="font-heading text-base sm:text-lg font-semibold text-foreground mb-2">{t(`${s.key}.title`, s.title)}</h2>
              <p className="text-sm sm:text-base text-muted-foreground leading-relaxed whitespace-pre-line">{t(`${s.key}.body`, s.body)}</p>
            </section>
          ))}
        </div>

        <div className="mt-10 text-center">
          <a href="https://wa.me/263715837174" target="_blank" rel="noopener noreferrer">
            <Button variant="outline">Questions? Contact support</Button>
          </a>
        </div>
      </main>
    </div>
  );
}
