import React, { useEffect, useState } from "react";
import { supabase } from "@/api/supabaseClient";
import { useAuth } from "@/lib/AuthContext";
import { Package } from "lucide-react";
import RequestCard from "@/components/RequestCard";
import { EmptyState } from "@/lib/movezw";

export default function CustomerHistory() {
  const { user } = useAuth();
  const [requests, setRequests] = useState(null);

  useEffect(() => {
    if (!user?.id) return;
    supabase
      .from("transport_requests")
      .select("*")
      .eq("customer_id", user.id)
      .order("created_at", { ascending: false })
      .limit(100)
      .then(({ data, error }) => {
        if (error) console.error("Failed to load trip history:", error);
        setRequests(data || []);
      });
  }, [user?.id]);

  return (
    <div className="p-4 space-y-4">
      <h1 className="text-2xl font-bold tracking-tight pt-2">My trips</h1>
      {requests === null ? (
        <div className="space-y-3">
          {[1, 2, 3].map((i) => <div key={i} className="h-28 rounded-2xl bg-muted animate-pulse" />)}
        </div>
      ) : requests.length === 0 ? (
        <div className="bg-card rounded-2xl border border-border">
          <EmptyState icon={Package} title="No trips yet" subtitle="Your transport requests will appear here once you create one." />
        </div>
      ) : (
        <div className="space-y-3">
          {requests.map((r) => (
            <RequestCard key={r.id} request={r} to={`/customer/request/${r.id}`} />
          ))}
        </div>
      )}
    </div>
  );
}
