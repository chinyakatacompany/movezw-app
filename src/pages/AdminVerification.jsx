import React, { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { supabase } from "@/api/supabaseClient";
import { Button } from "@/components/ui/button";
import { Check, X, Loader2, FileText, Car, UserPlus, ArrowRight } from "lucide-react";
import { StarRating } from "@/lib/movezw";
import { cn } from "@/lib/utils";
import { toast } from "@/components/ui/use-toast";
import { createNotification } from "@/lib/movezw";
import { getVerificationDocSignedUrl } from "@/lib/documents";

export default function AdminVerification() {
  const [profiles, setProfiles] = useState(null);
  const [filter, setFilter] = useState("pending");
  const [selected, setSelected] = useState(null);
  const [note, setNote] = useState("");
  const [acting, setActing] = useState(null);
  const [noProfileDrivers, setNoProfileDrivers] = useState(null);

  const load = () => {
    let query = supabase.from("driver_profiles").select("*").order("created_at", { ascending: false }).limit(50);
    if (filter !== "all") query = query.eq("verification_status", filter);
    query.then(({ data, error }) => {
      if (error) console.error("Failed to load driver profiles:", error);
      setProfiles(data || []);
    });
  };

  // Someone can register with role "driver" (Register.jsx) but never finish
  // DriverOnboarding.jsx, so there's no driver_profiles row for them at all
  // — they'd otherwise be invisible here even though they're a registered
  // driver waiting on documents. Diffed client-side rather than a SQL NOT
  // EXISTS since both tables are small at this app's scale.
  const loadNoProfile = async () => {
    const [{ data: driverAccounts, error: accErr }, { data: withProfile, error: dpErr }] = await Promise.all([
      supabase.from("profiles").select("id, full_name, phone, created_at").eq("role", "driver").order("created_at", { ascending: false }),
      supabase.from("driver_profiles").select("user_id"),
    ]);
    if (accErr) console.error("Failed to load driver accounts:", accErr);
    if (dpErr) console.error("Failed to load driver profiles:", dpErr);
    const withProfileIds = new Set((withProfile || []).map((p) => p.user_id));
    setNoProfileDrivers((driverAccounts || []).filter((d) => !withProfileIds.has(d.id)));
  };

  useEffect(() => { load();   }, [filter]);
  useEffect(() => { loadNoProfile(); }, []);

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
    <div className="p-4 sm:p-6 max-w-5xl mx-auto">
      <h1 className="text-2xl font-bold tracking-tight mb-1">Driver verification</h1>
      <p className="text-sm text-muted-foreground mb-5">Review submitted documents and approve drivers.</p>

      {noProfileDrivers && noProfileDrivers.length > 0 && (
        <div className="mb-6 bg-amber-50 border border-amber-200 rounded-2xl p-4">
          <h2 className="text-sm font-semibold text-amber-800 flex items-center gap-2 mb-1">
            <UserPlus className="w-4 h-4" /> Registered but no documents yet ({noProfileDrivers.length})
          </h2>
          <p className="text-xs text-amber-700/80 mb-3">
            These accounts signed up as a driver but never finished uploading documents. If you received their ID/licence/vehicle
            documents another way (e.g. WhatsApp), you can upload on their behalf and verify them here.
          </p>
          <div className="space-y-2">
            {noProfileDrivers.map((d) => (
              <Link
                key={d.id}
                to={`/admin/verification/${d.id}/onboard`}
                className="flex items-center gap-3 bg-card rounded-xl border border-amber-200/60 p-3 hover:border-amber-300 transition-colors"
              >
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium truncate">{d.full_name || "Unnamed"}</p>
                  <p className="text-xs text-muted-foreground truncate">{d.phone || "No phone on file"}</p>
                </div>
                <span className="text-xs font-semibold text-amber-700 inline-flex items-center gap-1 shrink-0">
                  Upload documents <ArrowRight className="w-3.5 h-3.5" />
                </span>
              </Link>
            ))}
          </div>
        </div>
      )}

      <div className="flex gap-2 mb-5 overflow-x-auto no-scrollbar">
        {tabs.map((t) => (
          <button
            key={t}
            onClick={() => setFilter(t)}
            className={cn(
              "px-4 py-2 rounded-full text-sm font-medium capitalize whitespace-nowrap transition-colors",
              filter === t ? "bg-primary text-primary-foreground" : "bg-card border border-border text-foreground hover:bg-muted"
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
            <div key={p.id} className="bg-card rounded-2xl border border-border p-4">
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
                  <p className="text-xs text-muted-foreground">
                    {[p.vehicle_name, p.vehicle_type].filter(Boolean).join(" ")}{p.license_plate ? ` (${p.license_plate})` : ""} · {p.location_area || "Zimbabwe"} · {p.phone}
                  </p>
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
  const [opening, setOpening] = useState(false);

  // Old documents (uploaded before the private-bucket fix) still have a
  // full public URL stored and open directly. New ones store just the
  // object's path in the private verification-docs bucket, so we resolve a
  // short-lived signed URL on demand instead of storing a permanent link.
  const open = async () => {
    if (/^https?:\/\//.test(url)) {
      window.open(url, "_blank", "noreferrer");
      return;
    }
    setOpening(true);
    try {
      const signedUrl = await getVerificationDocSignedUrl(url);
      window.open(signedUrl, "_blank", "noreferrer");
    } catch (e) {
      toast({ title: "Could not open document", description: e.message, variant: "destructive" });
    } finally {
      setOpening(false);
    }
  };

  return (
    <button
      type="button"
      onClick={open}
      disabled={opening}
      className="flex flex-col items-center gap-1 rounded-xl border border-border p-2.5 hover:bg-muted transition-colors disabled:opacity-60"
    >
      {opening ? <Loader2 className="w-5 h-5 text-primary animate-spin" /> : <FileText className="w-5 h-5 text-primary" />}
      <span className="text-[11px] font-medium text-center">{label}</span>
    </button>
  );
}
