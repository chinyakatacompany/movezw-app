import React, { useEffect, useState } from "react";
import { supabase } from "@/api/supabaseClient";
import { Button } from "@/components/ui/button";
import { BadgeCheck, Check, X, Loader2, FileText, Car, Star } from "lucide-react";
import { StatusBadge, StarRating, formatDate } from "@/lib/movezw";
import { cn } from "@/lib/utils";
import { toast } from "@/components/ui/use-toast";
import { createNotification } from "@/lib/movezw";

export default function AdminVerification() {
  const [profiles, setProfiles] = useState(null);
  const [filter, setFilter] = useState("pending");
  const [selected, setSelected] = useState(null);
  const [note, setNote] = useState("");
  const [acting, setActing] = useState(null);

  const load = () => {
    let query = supabase.from("driver_profiles").select("*").order("created_at", { ascending: false }).limit(50);
    if (filter !== "all") query = query.eq("verification_status", filter);
    query.then(({ data, error }) => {
      if (error) console.error("Failed to load driver profiles:", error);
      setProfiles(data || []);
    });
  };

  useEffect(() => { load(); /* eslint-disable-next-line */ }, [filter]);

  const decide = async (profile, decision) => {
    setActing(profile.id);
    try {
      const { error } = await supabase
        .from("driver_profiles")
        .update({
          verification_status: decision,
          verification_note: note || (decision === "approved" ? "Documents verified." : "Please re-upload clear documents."),
        })
        .eq("id", profile.id);
      if (error) throw error;
      await createNotification(profile.user_id, "verification", decision === "approved" ? "You're verified! ✅" : "Verification update", decision === "approved" ? "Your driver account is approved. You can now receive jobs." : "Your documents need attention. Please re-upload.", "/driver");
      toast({ title: decision === "approved" ? "Driver approved" : "Driver rejected" });
      setSelected(null);
      setNote("");
      load();
    } catch (e) {
      toast({ title: "Action failed", description: e.message, variant: "destructive" });
    } finally {
      setActing(null);
    }
  };

  const tabs = ["pending", "approved", "rejected", "all"];

  return (
    <div className="p-6 max-w-5xl mx-auto">
      <h1 className="text-2xl font-bold tracking-tight mb-1">Driver verification</h1>
      <p className="text-sm text-muted-foreground mb-5">Review submitted documents and approve drivers.</p>

      <div className="flex gap-2 mb-5 overflow-x-auto no-scrollbar">
        {tabs.map((t) => (
          <button
            key={t}
            onClick={() => setFilter(t)}
            className={cn(
              "px-4 py-2 rounded-full text-sm font-medium capitalize whitespace-nowrap transition-colors",
              filter === t ? "bg-primary text-primary-foreground" : "bg-white border border-border text-foreground hover:bg-muted"
            )}
          >
            {t}
          </button>
        ))}
      </div>

      {profiles === null ? (
        <div className="flex justify-center py-16"><Loader2 className="w-6 h-6 text-primary animate-spin" /></div>
      ) : profiles.length === 0 ? (
        <p className="text-sm text-muted-foreground py-16 text-center">No drivers in this category.</p>
      ) : (
        <div className="space-y-3">
          {profiles.map((p) => (
            <div key={p.id} className="bg-white rounded-2xl border border-border p-4">
              <div className="flex items-start gap-3">
                <div className="w-11 h-11 rounded-full bg-primary/10 flex items-center justify-center overflow-hidden shrink-0">
                  {p.profile_picture_url ? <img src={p.profile_picture_url} alt="" className="w-full h-full object-cover" /> : <Car className="w-5 h-5 text-primary" />}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between gap-2">
                    <p className="text-sm font-semibold truncate">{p.full_name}</p>
                    <span className={cn(
                      "text-xs font-medium px-2 py-0.5 rounded-full capitalize shrink-0",
                      p.verification_status === "approved" ? "bg-emerald-50 text-emerald-700" :
                      p.verification_status === "rejected" ? "bg-red-50 text-red-700" : "bg-amber-50 text-amber-700"
                    )}>{p.verification_status}</span>
                  </div>
                  <p className="text-xs text-muted-foreground">{p.vehicle_type} · {p.location_area || "Zimbabwe"} · {p.phone}</p>
                  <div className="flex items-center gap-1 mt-1">
                    <StarRating value={p.rating_avg || 0} />
                    <span className="text-[11px] text-muted-foreground ml-1">{p.completed_jobs || 0} jobs</span>
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-3 gap-2 mt-3">
                {p.national_id_url && <DocLink label="National ID" url={p.national_id_url} />}
                {p.driver_licence_url && <DocLink label="Licence" url={p.driver_licence_url} />}
                {p.vehicle_registration_url && <DocLink label="Registration" url={p.vehicle_registration_url} />}
              </div>

              {p.verification_status === "pending" && (
                <div className="flex gap-2 mt-3">
                  <Button
                    size="sm"
                    onClick={() => decide(p, "approved")}
                    disabled={acting === p.id}
                    className="flex-1 bg-emerald-600 hover:bg-emerald-700"
                  >
                    <Check className="w-4 h-4 mr-1.5" /> Approve
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => decide(p, "rejected")}
                    disabled={acting === p.id}
                    className="flex-1 text-destructive border-destructive/30 hover:bg-destructive/5"
                  >
                    <X className="w-4 h-4 mr-1.5" /> Reject
                  </Button>
                </div>
              )}
              {p.verification_note && p.verification_status !== "pending" && (
                <p className="text-xs text-muted-foreground mt-2 bg-muted/60 rounded-lg px-3 py-2">{p.verification_note}</p>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function DocLink({ label, url }) {
  return (
    <a href={url} target="_blank" rel="noreferrer" className="flex flex-col items-center gap-1 rounded-xl border border-border p-2.5 hover:bg-muted transition-colors">
      <FileText className="w-5 h-5 text-primary" />
      <span className="text-[11px] font-medium text-center">{label}</span>
    </a>
  );
}
