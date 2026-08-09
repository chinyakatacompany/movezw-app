import React, { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { supabase } from "@/api/supabaseClient";
import { ArrowLeft, Loader2 } from "lucide-react";
import DriverProfileForm from "@/components/DriverProfileForm";

// Lets an admin complete a driver's verification on their behalf — e.g. when
// someone registered in the app but sent their ID/licence/vehicle documents
// via WhatsApp instead of uploading them through DriverOnboarding.jsx.
// Submitting here verifies the driver immediately, since the admin is
// presumed to have already reviewed the documents before uploading them.
export default function AdminAssistedOnboarding() {
  const { userId } = useParams();
  const navigate = useNavigate();
  const [target, setTarget] = useState(null);
  const [existing, setExisting] = useState(null);
  const [loading, setLoading] = useState(true);
  const [skipDocs, setSkipDocs] = useState(false);

  useEffect(() => {
    if (!userId) return;
    (async () => {
      const [{ data: profile, error: profileErr }, { data: profiles, error: dpErr }] = await Promise.all([
        supabase.from("profiles").select("*").eq("id", userId).single(),
        supabase.from("driver_profiles").select("*").eq("user_id", userId).order("created_at", { ascending: false }).limit(1),
      ]);
      if (profileErr) console.error("Failed to load driver:", profileErr);
      if (dpErr) console.error("Failed to load driver profile:", dpErr);
      setTarget(profile || null);
      setExisting(profiles?.[0] || null);
      setLoading(false);
    })();
  }, [userId]);

  if (loading) {
    return <div className="p-8 flex justify-center"><Loader2 className="w-6 h-6 text-primary animate-spin" /></div>;
  }

  if (!target) {
    return (
      <div className="p-6 max-w-3xl mx-auto">
        <p className="text-sm text-muted-foreground">Driver not found.</p>
      </div>
    );
  }

  return (
    <div className="p-4 sm:p-6 max-w-3xl mx-auto pb-8">
      <button onClick={() => navigate("/admin/verification")} className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground mb-4">
        <ArrowLeft className="w-4 h-4" /> Back to verification
      </button>
      <h1 className="text-2xl font-bold tracking-tight mb-1">
        {existing ? "Edit" : "Verify"} {target.full_name || "driver"}
      </h1>
      <p className="text-sm text-muted-foreground mb-6">
        Upload their documents below — submitting {existing ? "saves changes" : "verifies this driver immediately"}.
      </p>

      <label className="flex items-start gap-2.5 mb-5 bg-amber-50 border border-amber-200 rounded-xl p-3 cursor-pointer select-none">
        <input
          type="checkbox"
          checked={skipDocs}
          onChange={(e) => setSkipDocs(e.target.checked)}
          className="mt-0.5 w-4 h-4 rounded border-border accent-primary shrink-0"
        />
        <span>
          <span className="text-sm font-medium block">Allow without documents (testing phase)</span>
          <span className="text-xs text-muted-foreground block mt-0.5">
            Vehicle make/model and licence plate are still required. Use this to get a driver receiving jobs quickly
            while testing, and add their ID/licence/registration later.
          </span>
        </span>
      </label>

      <DriverProfileForm
        userId={target.id}
        prefill={{ full_name: target.full_name, phone: target.phone }}
        existing={existing}
        autoApprove
        docsOptional={skipDocs}
        submitLabel={existing ? "Save changes" : "Save & verify driver"}
        onSaved={() => navigate("/admin/verification")}
      />
    </div>
  );
}
