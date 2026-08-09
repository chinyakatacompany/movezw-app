import React, { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/api/supabaseClient";
import { useAuth } from "@/lib/AuthContext";
import { ArrowLeft, Loader2 } from "lucide-react";
import DriverProfileForm from "@/components/DriverProfileForm";

export default function DriverOnboarding() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [existing, setExisting] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user?.id) return;
    supabase
      .from("driver_profiles")
      .select("*")
      .eq("user_id", user.id)
      .order("created_at", { ascending: false })
      .limit(1)
      .then(({ data, error }) => {
        if (error) console.error("Failed to load driver profile:", error);
        setExisting(data?.[0] || null);
      })
      .finally(() => setLoading(false));
  }, [user?.id]);

  if (loading) {
    return <div className="p-8 flex justify-center"><Loader2 className="w-6 h-6 text-primary animate-spin" /></div>;
  }

  return (
    <div className="p-4 pb-8">
      <button onClick={() => navigate("/driver")} className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground mb-4">
        <ArrowLeft className="w-4 h-4" /> Back
      </button>
      <h1 className="text-2xl font-bold tracking-tight mb-1">{existing ? "Edit driver profile" : "Become a driver"}</h1>
      <p className="text-sm text-muted-foreground mb-6">Upload your documents to start receiving transport jobs.</p>

      <DriverProfileForm
        userId={user.id}
        prefill={{ full_name: user.full_name, phone: user.phone }}
        existing={existing}
        onSaved={() => navigate("/driver")}
      />
    </div>
  );
}
