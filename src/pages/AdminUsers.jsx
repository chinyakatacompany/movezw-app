import React, { useEffect, useState } from "react";
import { base44 } from "@/api/base44Client";
import { Button } from "@/components/ui/button";
import { Users, Loader2, Search, Ban, CheckCircle2, Mail, Phone } from "lucide-react";
import { formatDate } from "@/lib/movezw";
import { cn } from "@/lib/utils";
import { toast } from "@/components/ui/use-toast";

export default function AdminUsers() {
  const [users, setUsers] = useState(null);
  const [q, setQ] = useState("");

  const load = () => {
    base44.entities.User.list("-created_date").then(setUsers).catch(() => setUsers([]));
  };

  useEffect(() => { load(); }, []);

  const toggleSuspend = async (u) => {
    try {
      await base44.entities.User.update(u.id, { is_suspended: !u.is_suspended });
      toast({ title: u.is_suspended ? "User reactivated" : "User suspended" });
      load();
    } catch (e) {
      toast({ title: "Action failed", description: e.message, variant: "destructive" });
    }
  };

  const filtered = (users || []).filter((u) =>
    !q || (u.email || "").toLowerCase().includes(q.toLowerCase()) || (u.full_name || "").toLowerCase().includes(q.toLowerCase())
  );

  return (
    <div className="p-6 max-w-5xl mx-auto">
      <h1 className="text-2xl font-bold tracking-tight mb-1">User management</h1>
      <p className="text-sm text-muted-foreground mb-5">All customers and drivers on MoveZW.</p>

      <div className="relative mb-5 max-w-sm">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Search by name or email..."
          className="w-full h-10 pl-10 pr-3 rounded-xl border border-border bg-white text-sm focus:outline-none focus:ring-2 focus:ring-primary/20"
        />
      </div>

      {users === null ? (
        <div className="flex justify-center py-16"><Loader2 className="w-6 h-6 text-primary animate-spin" /></div>
      ) : filtered.length === 0 ? (
        <div className="bg-white rounded-2xl border border-border py-16 text-center">
          <Users className="w-10 h-10 text-muted-foreground mx-auto mb-3" />
          <p className="text-sm text-muted-foreground">No users found.</p>
        </div>
      ) : (
        <div className="space-y-2">
          {filtered.map((u) => (
            <div key={u.id} className="bg-white rounded-2xl border border-border p-4 flex items-center gap-3">
              <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center text-primary font-semibold shrink-0">
                {(u.full_name || u.email || "?").charAt(0).toUpperCase()}
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <p className="text-sm font-semibold truncate">{u.full_name || "Unnamed"}</p>
                  <span className={cn(
                    "text-[10px] font-bold uppercase px-1.5 py-0.5 rounded",
                    u.role === "admin" ? "bg-purple-100 text-purple-700" : u.role === "driver" ? "bg-blue-100 text-blue-700" : "bg-slate-100 text-slate-700"
                  )}>{u.role || "customer"}</span>
                  {u.is_suspended && <span className="text-[10px] font-bold uppercase px-1.5 py-0.5 rounded bg-red-100 text-red-700">Suspended</span>}
                </div>
                <p className="text-xs text-muted-foreground truncate">{u.email}</p>
              </div>
              <Button
                size="sm"
                variant="outline"
                onClick={() => toggleSuspend(u)}
                className={cn(u.is_suspended ? "text-emerald-600 border-emerald-300 hover:bg-emerald-50" : "text-destructive border-destructive/30 hover:bg-destructive/5", "shrink-0")}
              >
                {u.is_suspended ? <><CheckCircle2 className="w-4 h-4 mr-1" />Reactivate</> : <><Ban className="w-4 h-4 mr-1" />Suspend</>}
              </Button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
