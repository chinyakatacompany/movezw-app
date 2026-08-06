import React, { useEffect, useState, useMemo } from "react";
import { Link, useNavigate } from "react-router-dom";
import { supabase } from "@/api/supabaseClient";
import { useAuth } from "@/lib/AuthContext";
import { MessageCircle, Loader2, Search } from "lucide-react";
import { Input } from "@/components/ui/input";
import { timeAgo, EmptyState } from "@/lib/movezw";

export default function Messages() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [conversations, setConversations] = useState([]);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState("");
  const [unread, setUnread] = useState({});

  const load = async () => {
    if (!user?.id) return;
    try {
      const [{ data: asCustomer }, { data: asDriver }] = await Promise.all([
        supabase.from("conversations").select("*").eq("customer_id", user.id).order("last_message_at", { ascending: false }).limit(100),
        supabase.from("conversations").select("*").eq("driver_id", user.id).order("last_message_at", { ascending: false }).limit(100),
      ]);
      const merged = [...(asCustomer || []), ...(asDriver || [])];
      // dedupe
      const seen = new Map();
      merged.forEach((c) => seen.set(c.id, c));
      setConversations([...seen.values()].sort((a, b) => new Date(b.last_message_at || b.created_at) - new Date(a.last_message_at || a.created_at)));
    } catch (e) {
      console.error("Failed to load conversations:", e);
    }
    setLoading(false);
  };

  useEffect(() => {
    if (!user?.id) return;
    load();
    // Real-time: refresh conversation list when any conversation or message changes
    const channel = supabase
      .channel(`messages-list-${user.id}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "conversations" }, load)
      .on("postgres_changes", { event: "*", schema: "public", table: "messages" }, load)
      .subscribe();
    return () => { supabase.removeChannel(channel); };
     
  }, [user?.id]);

  useEffect(() => {
    if (conversations.length === 0) return;
    supabase
      .from("messages")
      .select("*")
      .eq("is_read", false)
      .order("created_at", { ascending: false })
      .limit(200)
      .then(({ data: msgs, error }) => {
        if (error) { console.error("Failed to load unread counts:", error); return; }
        const map = {};
        (msgs || []).forEach((m) => {
          if (m.sender_id === user.id) return;
          const conv = conversations.find((c) => c.id === m.conversation_id);
          if (!conv) return;
          map[m.conversation_id] = (map[m.conversation_id] || 0) + 1;
        });
        setUnread(map);
      });
  }, [conversations, user?.id]);

  const filtered = useMemo(() => {
    if (!query) return conversations;
    const q = query.toLowerCase();
    return conversations.filter((c) => {
      const other = c.driver_id === user.id ? c.customer_name : c.driver_name;
      return (other || "").toLowerCase().includes(q) || (c.request_label || "").toLowerCase().includes(q);
    });
  }, [conversations, query, user?.id]);

  return (
    <div className="p-4 pb-8">
      <h1 className="text-2xl font-bold tracking-tight mb-1">Messages</h1>
      <p className="text-sm text-muted-foreground mb-4">Chat with your drivers and customers.</p>

      <div className="relative mb-4">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
        <Input placeholder="Search conversations" value={query} onChange={(e) => setQuery(e.target.value)} className="pl-10" />
      </div>

      {loading ? (
        <div className="flex justify-center py-16"><Loader2 className="w-6 h-6 text-primary animate-spin" /></div>
      ) : filtered.length === 0 ? (
        <div className="bg-card rounded-2xl border border-border">
          <EmptyState icon={MessageCircle} title="No conversations yet" subtitle="Start a chat from a transport request to message the other party." />
        </div>
      ) : (
        <div className="space-y-2">
          {filtered.map((c) => {
            const otherName = c.driver_id === user.id ? c.customer_name : c.driver_name;
            const count = unread[c.id] || 0;
            return (
              <Link
                key={c.id}
                to={`/chat/${c.id}`}
                className="flex items-center gap-3 bg-card rounded-2xl border border-border p-3.5 hover:border-primary/40 transition-colors"
              >
                <div className="w-12 h-12 rounded-full bg-primary/10 flex items-center justify-center text-primary font-semibold shrink-0">
                  {(otherName || "?").charAt(0).toUpperCase()}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between gap-2">
                    <p className="text-sm font-semibold truncate">{otherName || "Conversation"}</p>
                    <span className="text-[11px] text-muted-foreground shrink-0">{timeAgo(c.last_message_at || c.created_at)}</span>
                  </div>
                  <p className="text-xs text-muted-foreground truncate mt-0.5">{c.request_label}</p>
                  <p className={`text-xs mt-0.5 truncate ${count ? "text-foreground font-medium" : "text-muted-foreground"}`}>
                    {c.last_message || "No messages yet"}
                  </p>
                </div>
                {count > 0 && (
                  <span className="w-5 h-5 rounded-full bg-primary text-primary-foreground text-[11px] font-bold flex items-center justify-center shrink-0">{count}</span>
                )}
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}
