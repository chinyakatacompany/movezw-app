import React, { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/api/supabaseClient";
import { useAuth } from "@/lib/AuthContext";
import { Button } from "@/components/ui/button";
import { Users, Loader2, Search, Ban, CheckCircle2, Pencil, Check, X, MessageCircle } from "lucide-react";
import { cn } from "@/lib/utils";
import { toast } from "@/components/ui/use-toast";
import { getOrCreateAdminDriverConversation } from "@/lib/messaging";

export default function AdminUsers() {
  const { user: admin } = useAuth();
  const navigate = useNavigate();
  const [users, setUsers] = useState(null);
  const [q, setQ] = useState("");
  const [editingId, setEditingId] = useState(null);
  const [editName, setEditName] = useState("");
  const [editPhone, setEditPhone] = useState("");
  const [saving, setSaving] = useState(false);
  const [messaging, setMessaging] = useState(null);

  const load = () => {
    supabase
      .from("profiles")
      .select("*")
      .order("created_at", { ascending: false })
      .then(({ data, error }) => {
        if (error) console.error("Failed to load users:", error);
        setUsers(data || []);
      });
  };

  useEffect(() => { load(); }, []);

  const toggleSuspend = async (u) => {
    try {
      const { error } = await supabase.from("profiles").update({ is_suspended: !u.is_suspended }).eq("id", u.id);
      if (error) throw error;
      toast({ title: u.is_suspended ? "User reactivated" : "User suspended" });
      load();
    } catch (e) {
      toast({ title: "Action failed", description: e.message, variant: "destructive" });
    }
  };

  const messageDriver = async (u) => {
    setMessaging(u.id);
    try {
      const conv = await getOrCreateAdminDriverConversation({
        adminId: admin.id,
        adminName: admin.full_name || "MoveZW Admin",
        driverId: u.id,
        driverName: u.full_name || "Driver",
      });
      navigate(`/chat/${conv.id}`);
    } catch (e) {
      toast({ title: "Could not open chat", description: e.message, variant: "destructive" });
    } finally {
      setMessaging(null);
    }
  };

  const startEdit = (u) => {
    setEditingId(u.id);
    setEditName(u.full_name || "");
    setEditPhone(u.phone || "");
  };

  const saveEdit = async (u) => {
    setSaving(true);
    try {
      const { error } = await supabase.from("profiles").update({ full_name: editName.trim(), phone: editPhone.trim() }).eq("id", u.id);
      if (error) throw error;
      toast({ title: "User updated" });
      setEditingId(null);
      load();
    } catch (e) {
      toast({ title: "Could not update user", description: e.message, variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  const filtered = (users || []).filter((u) =>
    !q || (u.full_name || "").toLowerCase().includes(q.toLowerCase()) || (u.phone || "").toLowerCase().includes(q.toLowerCase())
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
          placeholder="Search by name or phone..."
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
              {editingId === u.id ? (
                <div className="flex-1 min-w-0 space-y-2">
                  <input
                    value={editName}
                    onChange={(e) => setEditName(e.target.value)}
                    placeholder="Full name"
                    className="w-full h-9 px-3 rounded-lg border border-border bg-white text-sm focus:outline-none focus:ring-2 focus:ring-primary/20"
                  />
                  <input
                    value={editPhone}
                    onChange={(e) => setEditPhone(e.target.value)}
                    placeholder="Phone"
                    className="w-full h-9 px-3 rounded-lg border border-border bg-white text-sm focus:outline-none focus:ring-2 focus:ring-primary/20"
                  />
                </div>
              ) : (
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <p className="text-sm font-semibold truncate">{u.full_name || "Unnamed"}</p>
                    <span className={cn(
                      "text-[10px] font-bold uppercase px-1.5 py-0.5 rounded",
                      u.role === "admin" ? "bg-purple-100 text-purple-700" : u.role === "driver" ? "bg-blue-100 text-blue-700" : "bg-slate-100 text-slate-700"
                    )}>{u.role || "customer"}</span>
                    {u.is_suspended && <span className="text-[10px] font-bold uppercase px-1.5 py-0.5 rounded bg-red-100 text-red-700">Suspended</span>}
                  </div>
                  <p className="text-xs text-muted-foreground truncate">{u.phone || "No phone on file"}</p>
                </div>
              )}
              <div className="flex gap-2 shrink-0">
                {editingId === u.id ? (
                  <>
                    <Button size="sm" onClick={() => saveEdit(u)} disabled={saving}>
                      {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
                    </Button>
                    <Button size="sm" variant="outline" onClick={() => setEditingId(null)} disabled={saving}>
                      <X className="w-4 h-4" />
                    </Button>
                  </>
                ) : (
                  <>
                    {u.role === "driver" && (
                      <Button size="sm" variant="outline" onClick={() => messageDriver(u)} disabled={messaging === u.id} title="Message this driver (e.g. about a tender)">
                        {messaging === u.id ? <Loader2 className="w-4 h-4 animate-spin" /> : <MessageCircle className="w-4 h-4" />}
                      </Button>
                    )}
                    <Button size="sm" variant="outline" onClick={() => startEdit(u)}>
                      <Pencil className="w-4 h-4" />
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => toggleSuspend(u)}
                      className={cn(u.is_suspended ? "text-emerald-600 border-emerald-300 hover:bg-emerald-50" : "text-destructive border-destructive/30 hover:bg-destructive/5")}
                    >
                      {u.is_suspended ? <><CheckCircle2 className="w-4 h-4 mr-1" />Reactivate</> : <><Ban className="w-4 h-4 mr-1" />Suspend</>}
                    </Button>
                  </>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
