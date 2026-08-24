import React from "react";
import { Link } from "react-router-dom";
import { ArrowLeft, Mail, Phone } from "lucide-react";
import { useDocumentMeta } from "@/lib/useDocumentMeta";

// Public (no login required) — Google Play's Data Safety form links to this
// directly from the store listing, so it has to be reachable by anyone
// considering the app, not just signed-in users.
export default function DeleteAccount() {
  useDocumentMeta("Delete Your Account | MoveZW", "How to request permanent deletion of your MoveZW account and data.");
  return (
    <div className="max-w-2xl mx-auto p-4 sm:p-6 pb-12">
      <Link to="/" className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground mb-6">
        <ArrowLeft className="w-4 h-4" /> Back
      </Link>
      <h1 className="text-2xl font-bold tracking-tight mb-2">Delete your MoveZW account</h1>
      <p className="text-sm text-muted-foreground mb-6">
        You can request permanent deletion of your MoveZW account and associated data at any time.
      </p>

      <div className="bg-card rounded-2xl border border-border p-5 space-y-4 mb-6">
        <h2 className="text-sm font-semibold">Fastest way: delete it in the app</h2>
        <p className="text-sm text-muted-foreground">
          If you can sign in, go to <span className="font-medium text-foreground">Profile → Danger zone → Delete account</span> for
          instant, self-service deletion — no waiting required.
        </p>
      </div>

      <div className="bg-card rounded-2xl border border-border p-5 space-y-4 mb-6">
        <h2 className="text-sm font-semibold">Can't sign in? Request it by email or phone</h2>
        <p className="text-sm text-muted-foreground">
          Email us from the address (or with the phone number) registered on your account, with the subject
          line "Delete my account". We'll confirm and process your request within 7 business days.
        </p>
        <a href="mailto:movezwsupport@gmail.com?subject=Delete%20my%20account" className="flex items-center gap-2 text-sm font-semibold text-primary">
          <Mail className="w-4 h-4" /> movezwsupport@gmail.com
        </a>
        <p className="text-sm text-muted-foreground">Or reach us by phone / WhatsApp:</p>
        <a href="tel:+263780269976" className="flex items-center gap-2 text-sm font-semibold text-primary">
          <Phone className="w-4 h-4" /> 0780 269 976
        </a>
      </div>

      <div className="bg-card rounded-2xl border border-border p-5 space-y-3">
        <h2 className="text-sm font-semibold">What gets deleted</h2>
        <p className="text-sm text-muted-foreground">
          Once processed, we permanently delete your profile information (name, phone number, email), uploaded
          documents and photos, and account credentials.
        </p>
        <p className="text-sm text-muted-foreground">
          Records of completed transport jobs and payment history may be retained as required for legal,
          accounting, and fraud-prevention purposes, with personal identifiers removed where possible.
        </p>
      </div>
    </div>
  );
}
