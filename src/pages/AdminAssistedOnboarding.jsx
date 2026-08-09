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

      <DriverProfileForm
        userId={target.id}
        prefill={{ full_name: target.full_name, phone: target.phone }}
        existing={existing}
        autoApprove
        submitLabel={existing ? "Save changes" : "Save & verify driver"}
        onSaved={() => navigate("/admin/verification")}
      />
    </div>
  );
}
