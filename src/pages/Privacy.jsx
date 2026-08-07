import React from "react";
import { Link } from "react-router-dom";
import { Truck, ArrowLeft, Lock } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useSiteContent } from "@/lib/siteContent";

// Same admin-editable pattern as Terms.jsx (see TERMS_SECTIONS there) — text
// is pulled from site_content via each section's key so admins can edit it
// at /admin/content without a code change; this array only supplies the
// fallback shown until a section is customized.
export const PRIVACY_SECTIONS = [
  {
    key: "privacy.1",
    title: "1. Information We Collect",
    body: "Account details: full name, phone number and email address. Driver applicants additionally submit a National ID, driver's licence and vehicle registration document for verification, plus vehicle details and an optional profile photo. When you create or accept a delivery, we collect pickup and destination locations, cargo details, and — while a job is active — the driver's live GPS location. We also store in-app chat messages, ratings, and wallet/commission transaction records.",
  },
  {
    key: "privacy.2",
    title: "2. How We Use Your Information",
    body: "To operate the marketplace: matching customers with nearby drivers, showing delivery status and live location during an active job, verifying driver identity and documents before approval, processing commission and wallet transactions, enabling in-app chat between the customer and driver on a job, and providing customer support.",
  },
  {
    key: "privacy.3",
    title: "3. How Information Is Shared",
    body: "Customers and drivers see limited details about each other only as needed for a job in progress — name, vehicle type, rating, and (once a driver is en route to pickup or later) phone number. Verification documents (National ID, licence, vehicle registration) are only ever visible to MoveZW admins reviewing driver applications, never to other customers or drivers. We do not sell your personal information. Location and routing data is sent to OpenStreetMap's routing service (OSRM) to calculate delivery routes and distances; this does not include your name or account details.",
  },
  {
    key: "privacy.4",
    title: "4. Data Storage & Security",
    body: "Data is stored with Supabase, our database and hosting provider, using access controls that restrict each user to their own data and restrict verification documents to admin review only. No system is perfectly secure, but we take reasonable measures to protect your information and correct issues quickly when found.",
  },
  {
    key: "privacy.5",
    title: "5. Data Retention",
    body: "We retain account and job data for as long as your account is active, and as needed to resolve disputes, maintain financial records, or comply with legal obligations. You can request deletion of your account and associated data at any time by contacting support.",
  },
  {
    key: "privacy.6",
    title: "6. Your Choices",
    body: "You can review and update your name and phone number from your profile at any time. To request a copy of your data, correct inaccurate information, or delete your account, contact movezwsupport@gmail.com or use the in-app Support Center.",
  },
  {
    key: "privacy.7",
    title: "7. Location Data",
    body: "Customers share a pickup and destination location when creating a delivery request. Drivers share their live location only while a job is active (from heading to pickup through delivery), so the customer can track their delivery. Location sharing stops once the job is completed or cancelled.",
  },
  {
    key: "privacy.8",
    title: "8. Children's Privacy",
    body: "MoveZW is not intended for use by anyone under 18. We do not knowingly collect information from children.",
  },
  {
    key: "privacy.9",
    title: "9. Changes to This Policy",
    body: "We may update this Privacy Policy from time to time. Material changes will be communicated to active users. Continued use of MoveZW after a change constitutes acceptance of the revised policy.",
  },
  {
    key: "privacy.10",
    title: "10. Contact",
    body: "Questions about this Privacy Policy or your data can be sent to movezwsupport@gmail.com or through the in-app Support Center.",
  },
];

export default function Privacy() {
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
          <Lock className="w-4 h-4" /> Legal
        </div>
        <h1 className="text-3xl sm:text-4xl font-bold tracking-tight text-foreground">Privacy Policy</h1>
        <p className="mt-3 text-sm text-muted-foreground">Last updated: August 2026</p>

        <div className="mt-8 space-y-6">
          {PRIVACY_SECTIONS.map((s) => (
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
