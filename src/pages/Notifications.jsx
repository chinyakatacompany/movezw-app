import React, { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { supabase } from "@/api/supabaseClient";
import { useAuth } from "@/lib/AuthContext";
import { Bell, Loader2 } from "lucide-react";
import { EmptyState, timeAgo } from "@/lib/movezw";
import { cn } from "@/lib/utils";

export default function Notifications() {
  const { user } = useAuth();
  const [items, setItems] = useState(null);

  const load = () => {
    if (!user?.id) return;
    supabase
      .from("notifications")
      .select("*")
      .eq("user_id", user.id)
      .order("created_at", { ascending: false })
      .limit(50)
      .then(({ data, error }) => {
        if (error) console.error("Failed to load notifications:", error);
        setItems(data || []);
      });
  };

  useEffect(() => { load(); }, [user?.id]);

  const markRead = async (n) => {
    if (n.is_read) return;
    await supabase.from("notifications").update({ is_read: true }).eq("id", n.id);
    load();
  };

  const markAllRead = async () => {
    await supabase.from("notifications").update({ is_read: true }).eq("user_id", user.id).eq("is_read", false);
    load();
  };

  if (items === null) {
    return <div className="p-8 flex justify-center"><Loader2 className="w-6 h-6 text-primary animate-spin" /></div>;
  }

  const unread = items.filter((n) => !n.is_read).length;

  return (
    <div className="p-4 space-y-3">
      <div className="flex items-center justify-between pt-2">
        <h1 className="text-2xl font-bold tracking-tight">Notifications</h1>
        {unread > 0 && (
          <button onClick={markAllRead} className="text-xs text-primary font-medium">Mark all read</button>
        )}
      </div>
      {items.length === 0 ? (
        <div className="bg-white rounded-2xl border border-border">
          <EmptyState icon={Bell} title="No notifications" subtitle="Updates about your deliveries will show up here." />
        </div>
      ) : (
        <div className="space-y-2">
          {items.map((n) => (
            <button
              key={n.id}
              onClick={() => markRead(n)}
              className={cn(
                "w-full text-left bg-white rounded-2xl border p-4 transition-colors",
                n.is_read ? "border-border" : "border-primary/30 bg-primary/5"
              )}
            >
              <div className="flex items-start gap-3">
                <div className={cn("w-2 h-2 rounded-full mt-1.5 shrink-0", n.is_read ? "bg-transparent" : "bg-primary")} />
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold">{n.title}</p>
                  <p className="text-sm text-muted-foreground mt-0.5">{n.message}</p>
                  <p className="text-[11px] text-muted-foreground mt-1.5">{timeAgo(n.created_at)}</p>
                </div>
                {n.link && (
                  <Link to={n.link} onClick={(e) => e.stopPropagation()} className="text-xs text-primary font-medium shrink-0 mt-1">View</Link>
                )}
              </div>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
