import React, { useEffect, useRef, useState } from "react";
import { useParams, useNavigate, Link } from "react-router-dom";
import { base44 } from "@/api/base44Client";
import { useAuth } from "@/lib/AuthContext";
import { ArrowLeft, Send, Image as ImageIcon, Loader2, CheckCheck, Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import { toast } from "@/components/ui/use-toast";

function formatTime(d) {
  if (!d) return "";
  return new Date(d).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" });
}

export default function Chat() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { user } = useAuth();
  const [conversation, setConversation] = useState(null);
  const [messages, setMessages] = useState([]);
  const [loading, setLoading] = useState(true);
  const [text, setText] = useState("");
  const [sending, setSending] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [typing, setTyping] = useState(false);
  const [otherTyping, setOtherTyping] = useState(false);
  const [markingRead, setMarkingRead] = useState(false);
  const scrollRef = useRef(null);
  const typingTimer = useRef(null);

  const load = async () => {
    try {
      const conv = await base44.entities.Conversation.get(id);
      setConversation(conv);
      const msgs = await base44.entities.Message.filter({ conversation_id: id }, "created_date", 500);
      setMessages(msgs);
    } catch (e) {
      /* ignore */
    }
    setLoading(false);
  };

  useEffect(() => {
    load();
    const unsubMsg = base44.entities.Message.subscribe((event) => {
      if (event?.data?.conversation_id === id) {
        load();
      } else if (event?.type === "create" || event?.type === "update") {
        // refresh on any new message (filter re-checks)
        load();
      }
    });
    const unsubConv = base44.entities.Conversation.subscribe((event) => {
      if (event?.data?.id === id) {
        setConversation((prev) => ({ ...prev, ...event.data }));
        const t = event.data.typing_at ? new Date(event.data.typing_at).getTime() : 0;
        setOtherTyping(event.data.typing_user_id && event.data.typing_user_id !== user.id && Date.now() - t < 4000);
      }
    });
    return () => { unsubMsg?.(); unsubConv?.(); };
    // eslint-disable-next-line
  }, [id]);

  // Mark incoming messages as read
  useEffect(() => {
    if (loading || !user?.id) return;
    const toRead = messages.filter((m) => m.sender_id !== user.id && !m.is_read);
    if (toRead.length === 0) return;
    setMarkingRead(true);
    Promise.all(toRead.map((m) => base44.entities.Message.update(m.id, { is_read: true })))
      .catch(() => {})
      .finally(() => setMarkingRead(false));
  }, [messages, user?.id, loading]);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [messages.length, otherTyping]);

  const sendTyping = () => {
    base44.entities.Conversation.update(id, {
      typing_user_id: user.id,
      typing_at: new Date().toISOString(),
    }).catch(() => {});
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
      const msg = await base44.entities.Message.create({
        conversation_id: id,
        sender_id: user.id,
        text: body,
        is_read: false,
      });
      await base44.entities.Conversation.update(id, {
        last_message: body,
        last_message_at: new Date().toISOString(),
        typing_user_id: "",
        typing_at: null,
      });
      setMessages((prev) => [...prev, msg]);
      setText("");
      setTyping(false);
      // notify the other party
      const recipient = conversation.driver_id === user.id ? conversation.customer_id : conversation.driver_id;
      const otherName = conversation.driver_id === user.id ? conversation.customer_name : conversation.driver_name;
      const me = user.full_name || "Someone";
      try {
        await base44.entities.Notification.create({
          user_id: recipient,
          type: "admin",
          title: `New message from ${me}`,
          message: body,
          link: `/chat/${id}`,
        });
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
      const { file_url } = await base44.integrations.Core.UploadFile({ file });
      const msg = await base44.entities.Message.create({
        conversation_id: id,
        sender_id: user.id,
        image_url: file_url,
        is_read: false,
      });
      await base44.entities.Conversation.update(id, {
        last_message: "📷 Photo",
        last_message_at: new Date().toISOString(),
      });
      setMessages((prev) => [...prev, msg]);
      const recipient = conversation.driver_id === user.id ? conversation.customer_id : conversation.driver_id;
      try {
        await base44.entities.Notification.create({
          user_id: recipient,
          type: "admin",
          title: `New photo from ${user.full_name || "Someone"}`,
          message: "📷 Photo",
          link: `/chat/${id}`,
        });
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

  const otherName = conversation.driver_id === user.id ? conversation.customer_name : conversation.driver_name;

  return (
    <div className="flex flex-col h-screen">
      {/* Header */}
      <div className="sticky top-0 z-20 bg-white border-b border-border">
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
            const showDate = !prev || new Date(prev.created_date).toDateString() !== new Date(m.created_date).toDateString();
            return (
              <React.Fragment key={m.id}>
                {showDate && (
                  <div className="text-center my-3">
                    <span className="text-[11px] text-muted-foreground bg-muted px-2.5 py-1 rounded-full">
                      {new Date(m.created_date).toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short" })}
                    </span>
                  </div>
                )}
                <div className={`flex ${mine ? "justify-end" : "justify-start"}`}>
                  <div className={`max-w-[78%] rounded-2xl px-3.5 py-2 ${mine ? "bg-primary text-primary-foreground rounded-br-md" : "bg-white border border-border rounded-bl-md"}`}>
                    {m.image_url && (
                      <a href={m.image_url} target="_blank" rel="noreferrer" className="block mb-1">
                        <img src={m.image_url} alt="" className="rounded-lg max-h-56 w-full object-cover" />
                      </a>
                    )}
                    {m.text && <p className="text-sm whitespace-pre-wrap break-words">{m.text}</p>}
                    <div className={`flex items-center justify-end gap-1 mt-0.5 ${mine ? "text-primary-foreground/70" : "text-muted-foreground"}`}>
                      <span className="text-[10px]">{formatTime(m.created_date)}</span>
                      {mine && (m.is_read ? <CheckCheck className="w-3.5 h-3.5" /> : <Check className="w-3.5 h-3.5" />)}
                    </div>
                  </div>
                </div>
              </React.Fragment>
            );
          })}
          {otherTyping && (
            <div className="flex justify-start">
              <div className="bg-white border border-border rounded-2xl rounded-bl-md px-4 py-2.5">
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
      <form onSubmit={sendMessage} className="sticky bottom-0 z-20 bg-white border-t border-border safe-bottom">
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
    </div>
  );
}
