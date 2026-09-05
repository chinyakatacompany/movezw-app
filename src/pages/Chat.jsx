import React, { useEffect, useRef, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { supabase } from "@/api/supabaseClient";
import { useAuth } from "@/lib/AuthContext";
import { ArrowLeft, Send, Image as ImageIcon, Loader2, CheckCheck, Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import { toast } from "@/components/ui/use-toast";
import { createNotification } from "@/lib/movezw";
import ImageLightbox from "@/components/ImageLightbox";

function formatTime(d) {
  if (!d) return "";
  return new Date(d).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" });
}

export default function Chat() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { user } = useAuth();
  const [conversation, setConversation] = useState(null);
  const [requestCustomer, setRequestCustomer] = useState(null);
  const [messages, setMessages] = useState([]);
  const [loading, setLoading] = useState(true);
  const [text, setText] = useState("");
  const [sending, setSending] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [typing, setTyping] = useState(false);
  const [otherTyping, setOtherTyping] = useState(false);
  const [markingRead, setMarkingRead] = useState(false);
  const [lightboxIndex, setLightboxIndex] = useState(null);
  const scrollRef = useRef(null);
  const typingTimer = useRef(null);

  const load = async () => {
    try {
      const { data: conv, error: convErr } = await supabase.from("conversations").select("*").eq("id", id).single();
      if (convErr) throw convErr;
      setConversation(conv);
      if (conv.request_id) {
        const { data: linkedRequest } = await supabase
          .from("transport_requests")
          .select("accepted_driver_id, customer_name")
          .eq("id", conv.request_id)
          .single();
        setRequestCustomer(linkedRequest || null);
      } else {
        setRequestCustomer(null);
      }
      const { data: msgs, error: msgErr } = await supabase
        .from("messages")
        .select("*")
        .eq("conversation_id", id)
        .order("created_at", { ascending: true })
        .limit(500);
      if (msgErr) throw msgErr;
      setMessages(msgs || []);
    } catch (e) {
      console.error("Failed to load conversation:", e);
    }
    setLoading(false);
  };

  useEffect(() => {
    load();
    const channel = supabase
      .channel(`chat-${id}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "messages", filter: `conversation_id=eq.${id}` }, load)
      .on("postgres_changes", { event: "UPDATE", schema: "public", table: "conversations", filter: `id=eq.${id}` }, (payload) => {
        const data = payload.new;
        setConversation((prev) => ({ ...prev, ...data }));
        const t = data.typing_at ? new Date(data.typing_at).getTime() : 0;
        setOtherTyping(data.typing_user_id && data.typing_user_id !== user.id && Date.now() - t < 4000);
      })
      .subscribe();
    return () => { supabase.removeChannel(channel); };
     
  }, [id]);

  // Mark incoming messages as read
  useEffect(() => {
    if (loading || !user?.id) return;
    const toRead = messages.filter((m) => m.sender_id !== user.id && !m.is_read);
    if (toRead.length === 0) return;
    setMarkingRead(true);
    Promise.all(toRead.map((m) => supabase.from("messages").update({ is_read: true }).eq("id", m.id)))
      .catch(() => {})
      .finally(() => setMarkingRead(false));
  }, [messages, user?.id, loading]);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [messages.length, otherTyping]);

  const sendTyping = () => {
    supabase
      .from("conversations")
      .update({ typing_user_id: user.id, typing_at: new Date().toISOString() })
      .eq("id", id)
      .then(() => {});
  };

  const handleTextChange = (v) => {
    setText(v);
    if (typingTimer.current) clearTimeout(typingTimer.current);
    if (!typing) { setTyping(true); sendTyping(); }
    typingTimer.current = setTimeout(() => setTyping(false), 3000);
  };

  const sendMessage = async (e) => {
    e?.preventDefault();
    const body = text.trim();
    if (!body || sending) return;
    setSending(true);
    try {
      const { data: msg, error } = await supabase
        .from("messages")
        .insert({ conversation_id: id, sender_id: user.id, text: body, is_read: false })
        .select()
        .single();
      if (error) throw error;
      await supabase
        .from("conversations")
        .update({ last_message: body, last_message_at: new Date().toISOString(), typing_user_id: null, typing_at: null })
        .eq("id", id);
      setMessages((prev) => [...prev, msg]);
      setText("");
      setTyping(false);
      // notify the other party
      const recipient = conversation.driver_id === user.id ? conversation.customer_id : conversation.driver_id;
      const customerIsAnonymous = conversation.request_id
        && conversation.customer_id === user.id
        && requestCustomer?.accepted_driver_id !== conversation.driver_id;
      const me = customerIsAnonymous ? "Customer" : (user.full_name || "Someone");
      try {
        await createNotification(recipient, "admin", `New message from ${me}`, body, `/chat/${id}`);
      } catch (_) {}
    } catch (err) {
      toast({ title: "Could not send", description: err.message, variant: "destructive" });
    } finally {
      setSending(false);
    }
  };

  const sendImage = async (file) => {
    if (!file) return;
    setUploading(true);
    try {
      const fileName = `${Date.now()}-${Math.random().toString(36).slice(2)}-${file.name}`;
      const { error: uploadErr } = await supabase.storage.from("documents").upload(fileName, file);
      if (uploadErr) throw uploadErr;
      const { data: pub } = supabase.storage.from("documents").getPublicUrl(fileName);
      const { data: msg, error } = await supabase
        .from("messages")
        .insert({ conversation_id: id, sender_id: user.id, image_url: pub.publicUrl, is_read: false })
        .select()
        .single();
      if (error) throw error;
      await supabase
        .from("conversations")
        .update({ last_message: "📷 Photo", last_message_at: new Date().toISOString() })
        .eq("id", id);
      setMessages((prev) => [...prev, msg]);
      const recipient = conversation.driver_id === user.id ? conversation.customer_id : conversation.driver_id;
      const customerIsAnonymous = conversation.request_id
        && conversation.customer_id === user.id
        && requestCustomer?.accepted_driver_id !== conversation.driver_id;
      const senderName = customerIsAnonymous ? "Customer" : (user.full_name || "Someone");
      try {
        await createNotification(recipient, "admin", `New photo from ${senderName}`, "📷 Photo", `/chat/${id}`);
      } catch (_) {}
    } catch (err) {
      toast({ title: "Upload failed", description: err.message, variant: "destructive" });
    } finally {
      setUploading(false);
    }
  };

  if (loading) {
    return <div className="p-8 flex justify-center"><Loader2 className="w-6 h-6 text-primary animate-spin" /></div>;
  }
  if (!conversation) return <div className="p-8 text-center text-muted-foreground">Conversation not found.</div>;

  const driverCanSeeCustomer = !conversation.request_id
    || requestCustomer?.accepted_driver_id === conversation.driver_id;
  const otherName = conversation.driver_id === user.id
    ? (driverCanSeeCustomer ? (requestCustomer?.customer_name || conversation.customer_name) : "Customer")
    : conversation.driver_name;
  // Every photo in the thread, in order — lets the lightbox opened from any
  // one message flip through the whole conversation's photos, not just that
  // single attachment.
  const chatImages = messages.filter((m) => m.image_url).map((m) => m.image_url);

  return (
    <div className="flex flex-col h-screen">
      {/* Header */}
      <div className="sticky top-0 z-20 bg-card border-b border-border">
        <div className="max-w-2xl mx-auto px-3 h-14 flex items-center gap-3">
          <button onClick={() => navigate(-1)} className="w-9 h-9 rounded-full hover:bg-muted flex items-center justify-center">
            <ArrowLeft className="w-5 h-5" />
          </button>
          <div className="w-9 h-9 rounded-full bg-primary/10 flex items-center justify-center text-primary font-semibold shrink-0">
            {(otherName || "?").charAt(0).toUpperCase()}
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-semibold truncate">{otherName || "Chat"}</p>
            <p className="text-[11px] text-muted-foreground truncate">{conversation.request_label}</p>
          </div>
          {markingRead && <Loader2 className="w-4 h-4 text-muted-foreground animate-spin" />}
        </div>
      </div>

      {/* Messages */}
      <div ref={scrollRef} className="flex-1 overflow-y-auto px-4 py-4 max-w-2xl mx-auto w-full">
        <div className="space-y-2">
          {messages.map((m, idx) => {
            const mine = m.sender_id === user.id;
            const prev = messages[idx - 1];
            const showDate = !prev || new Date(prev.created_at).toDateString() !== new Date(m.created_at).toDateString();
            return (
              <React.Fragment key={m.id}>
                {showDate && (
                  <div className="text-center my-3">
                    <span className="text-[11px] text-muted-foreground bg-muted px-2.5 py-1 rounded-full">
                      {new Date(m.created_at).toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short" })}
                    </span>
                  </div>
                )}
                <div className={`flex ${mine ? "justify-end" : "justify-start"}`}>
                  <div className={`max-w-[78%] rounded-2xl px-3.5 py-2 ${mine ? "bg-primary text-primary-foreground rounded-br-md" : "bg-card border border-border rounded-bl-md"}`}>
                    {m.image_url && (
                      <button type="button" onClick={() => setLightboxIndex(chatImages.indexOf(m.image_url))} className="block mb-1">
                        <img src={m.image_url} alt="" className="rounded-lg max-h-56 w-full object-cover" />
                      </button>
                    )}
                    {m.text && <p className="text-sm whitespace-pre-wrap break-words">{m.text}</p>}
                    <div className={`flex items-center justify-end gap-1 mt-0.5 ${mine ? "text-primary-foreground/70" : "text-muted-foreground"}`}>
                      <span className="text-[10px]">{formatTime(m.created_at)}</span>
                      {mine && (m.is_read ? <CheckCheck className="w-3.5 h-3.5" /> : <Check className="w-3.5 h-3.5" />)}
                    </div>
                  </div>
                </div>
              </React.Fragment>
            );
          })}
          {otherTyping && (
            <div className="flex justify-start">
              <div className="bg-card border border-border rounded-2xl rounded-bl-md px-4 py-2.5">
                <div className="flex gap-1">
                  <span className="w-1.5 h-1.5 rounded-full bg-muted-foreground/50 animate-bounce" style={{ animationDelay: "0ms" }} />
                  <span className="w-1.5 h-1.5 rounded-full bg-muted-foreground/50 animate-bounce" style={{ animationDelay: "150ms" }} />
                  <span className="w-1.5 h-1.5 rounded-full bg-muted-foreground/50 animate-bounce" style={{ animationDelay: "300ms" }} />
                </div>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Composer */}
      <form onSubmit={sendMessage} className="sticky bottom-0 z-20 bg-card border-t border-border safe-bottom">
        <div className="max-w-2xl mx-auto px-3 py-2.5 flex items-center gap-2">
          <label className="w-10 h-10 rounded-full hover:bg-muted flex items-center justify-center cursor-pointer shrink-0">
            {uploading ? <Loader2 className="w-5 h-5 text-muted-foreground animate-spin" /> : <ImageIcon className="w-5 h-5 text-muted-foreground" />}
            <input type="file" accept="image/*" className="hidden" onChange={(e) => sendImage(e.target.files?.[0])} disabled={uploading} />
          </label>
          <input
            value={text}
            onChange={(e) => handleTextChange(e.target.value)}
            placeholder="Type a message..."
            className="flex-1 h-11 rounded-full border border-input bg-muted/40 px-4 text-sm focus:outline-none focus:ring-1 focus:ring-ring"
          />
          <Button type="submit" size="icon" className="w-11 h-11 rounded-full shrink-0" disabled={sending || !text.trim()}>
            <Send className="w-5 h-5" />
          </Button>
        </div>
      </form>

      <ImageLightbox images={chatImages} index={lightboxIndex} onClose={() => setLightboxIndex(null)} onIndexChange={setLightboxIndex} />
    </div>
  );
}
