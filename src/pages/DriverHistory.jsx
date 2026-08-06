import React, { useEffect, useState } from "react";
import { supabase } from "@/api/supabaseClient";
import { useAuth } from "@/lib/AuthContext";
import { Package } from "lucide-react";
import RequestCard from "@/components/RequestCard";
import { EmptyState } from "@/lib/movezw";

export default function DriverHistory() {
  const { user } = useAuth();
  const [jobs, setJobs] = useState(null);

  useEffect(() => {
    if (!user?.id) return;
    supabase
      .from("transport_requests")
      .select("*")
      .eq("accepted_driver_id", user.id)
      .order("created_at", { ascending: false })
      .limit(100)
      .then(({ data, error }) => {
        if (error) console.error("Failed to load job history:", error);
        setJobs(data || []);
      });
  }, [user?.id]);

  return (
    <div className="p-4 space-y-4">
      <h1 className="text-2xl font-bold tracking-tight pt-2">My jobs</h1>
      {jobs === null ? (
        <div className="space-y-3">
          {[1, 2, 3].map((i) => <div key={i} className="h-28 rounded-2xl bg-muted animate-pulse" />)}
        </div>
      ) : jobs.length === 0 ? (
        <div className="bg-white rounded-2xl border border-border">
          <EmptyState icon={Package} title="No jobs yet" subtitle="Jobs you accept and complete will be listed here." />
        </div>
      ) : (
        <div className="space-y-3">
          {jobs.map((r) => (
            <RequestCard key={r.id} request={r} to={`/driver/job/${r.id}`} showCustomer />
          ))}
        </div>
      )}
    </div>
  );
}
