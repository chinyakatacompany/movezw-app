import React, { useEffect, useState } from "react";
import { base44 } from "@/api/base44Client";
import { useAuth } from "@/lib/AuthContext";
import { Package, Loader2 } from "lucide-react";
import RequestCard from "@/components/RequestCard";
import { EmptyState } from "@/lib/movezw";

export default function DriverHistory() {
  const { user } = useAuth();
  const [jobs, setJobs] = useState(null);

  useEffect(() => {
    if (!user?.id) return;
    base44.entities.TransportRequest
      .filter({ accepted_driver_id: user.id }, "-created_date", 100)
      .then(setJobs)
      .catch(() => setJobs([]));
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
