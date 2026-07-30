import React, { useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { supabase } from "@/api/supabaseClient";
import { useAuth } from "@/lib/AuthContext";
import { ArrowLeft, Star, Check, Loader2, Truck, ShieldCheck, Clock, Package, MessageCircle, ChevronDown } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { StatusBadge, StarRating, STATUS_FLOW, STATUS_LABELS, formatMoney, timeAgo, formatDate, VEHICLE_ICONS, createNotification, EmptyState } from "@/lib/movezw";
import { getOrCreateConversation } from "@/lib/messaging";
import { toast } from "@/components/ui/use-toast";
import { cn } from "@/lib/utils";

const SORT_OPTIONS = [
  { id: "price", label: "Lowest price" },
  { id: "rating", label: "Top rated" },
];

export default function RequestDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { user } = useAuth();
  const [request, setRequest] = useState(null);
  const [offers, setOffers] = useState(null);
  const [loading, setLoading] = useState(true);
  const [accepting, setAccepting] = useState(null);
  const [sortBy, setSortBy] = useState("price");
  const [sortOpen, setSortOpen] = useState(false);
  const [rating, setRating] = useState(0);
  const [comment, setComment] = useState("");
  const [submittingRating, setSubmittingRating] = useState(false);
  const [alreadyRated, setAlreadyRated] = useState(false);

  const load = async () => {
    const { data: req } = await supabase.from("transport_requests").select("*").eq("id", id).single();
    const { data: offs } = await supabase.from("offers").select("*").eq("request_id", id).order("price");
    setRequest(req);
    setOffers(offs || []);
    setLoading(false);
  };

  useEffect(() => { load(); }, [id]);

  // Live-refresh this page as the driver progresses the job (en route, collected,
  // etc.) or new offers come in, so the customer doesn't need to check notifications.
  useEffect(() => {
    if (!id) return;
    const channel = supabase
      .channel(`request-detail-${id}`)
      .on("postgres_changes", { event: "UPDATE", schema: "public", table: "transport_requests", filter: `id=eq.${id}` }, load)
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "offers", filter: `request_id=eq.${id}` }, load)
      .on("postgres_changes", { event: "UPDATE", schema: "public", table: "offers", filter: `request_id=eq.${id}` }, load)
      .subscribe();
    return () => { supabase.removeChannel(channel); };
    /* eslint-disable-next-line */
  }, [id]);

  useEffect(() => {
    if (!request?.status || request.status !== "completed" || !user?.id) return;
    supabase.from("ratings").select("id").eq("request_id", request.id).eq("customer_id", user.id)
      .then(({ data }) => setAlreadyRated((data || []).length > 0));
  }, [request?.id, request?.status, user?.id]);

  const openChat = async () => {
    try {
      const conv = await getOrCreateConversation({
        request,
        driverId: request.accepted_driver_id,
        driverName: acceptedOffer?.driver_name,
        customerName: request.customer_name,
      });
      navigate(`/chat/${conv.id}`);
    } catch (e) {
      toast({ title: "Could not open chat", description: e.message, variant: "destructive" });
    }
  };

  const acceptOffer = async (offer) => {
    setAccepting(offer.id);
    try {
      await supabase.from("transport_requests").update({
        status: "confirmed",
        accepted_offer_id: offer.id,
        accepted_driver_id: offer.driver_id,
        accepted_price: offer.price,
      }).eq("id", request.id);

      await supabase.from("offers").update({ status: "rejected" }).eq("request_id", request.id).eq("status", "pending");
      await supabase.from("offers").update({ status: "accepted" }).eq("id", offer.id);

      await createNotification(offer.driver_id, "offer_accepted", "Offer accepted! 🎉", `Your offer for ${request.cargo_type} from ${request.pickup_location} was accepted.`, `/driver/job/${request.id}`);
      toast({ title: "Driver booked", description: `${offer.driver_name} has been notified.` });
      load();
    } catch (e) {
      toast({ title: "Could not accept offer", description: e.message, variant: "destructive" });
    } finally {
      setAccepting(null);
    }
  };

  const submitRating = async () => {
    if (!rating) return;
    setSubmittingRating(true);
    try {
      await supabase.from("ratings").insert({
        request_id: request.id,
        customer_id: user.id,
        driver_id: request.accepted_driver_id,
        stars: rating,
        comment,
      });
      await createNotification(request.accepted_driver_id, "rating_received", "New rating received ⭐", `You received a ${rating}-star rating.`, `/driver`);
      setAlreadyRated(true);
      toast({ title: "Thanks for your rating!" });
    } catch (e) {
      toast({ title: "Could not submit rating", description: e.message, variant: "destructive" });
    } finally {
      setSubmittingRating(false);
    }
  };

  const cancelRequest = async () => {
    if (!window.confirm("Cancel this request? The assigned driver will be notified.")) return;
    try {
      await supabase.from("transport_requests").update({ status: "cancelled" }).eq("id", request.id);
      toast({ title: "Request cancelled" });
      load();
    } catch (e) {
      toast({ title: "Could not cancel", description: e.message, variant: "destructive" });
    }
  };

  if (loading) {
    return <div className="p-4 flex items-center justify-center py-32"><Loader2 className="w-6 h-6 text-primary animate-spin" /></div>;
  }
  if (!request) return <div className="p-8 text-center text-muted-foreground">Request not found.</div>;

  const activeStep = STATUS_FLOW.indexOf(request.status);
  const acceptedOffer = offers?.find((o) => o.id === request.accepted_offer_id);
  const pendingOffers = offers?.filter((o) => o.status === "pending") || [];
  const showOffers = request.status === "open";
  const showTracking = STATUS_FLOW.includes(request.status) || request.status === "completed";

  return (
    <div className="p-4 pb-8 space-y-5">
      <button onClick={() => navigate(-1)} className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft className="w-4 h-4" /> Back
      </button>

      <div>
        <div className="flex items-center justify-between mb-2">
          <h1 className="text-xl font-bold">{request.cargo_type}</h1>
          <StatusBadge status={request.status} />
        </div>
        <p className="text-xs text-muted-foreground">Posted {timeAgo(request.created_at)}</p>
      </div>

      <div className="bg-white rounded-2xl border border-border p-4">
        <div className="flex gap-3">
          <div className="flex flex-col items-center pt-1">
            <span className="w-2.5 h-2.5 rounded-full bg-primary" />
            <span className="w-0.5 flex-1 bg-border my-1" />
            <span className="w-2.5 h-2.5 rounded-full bg-emerald-500" />
          </div>
          <div className="flex-1 space-y-3 pb-1">
            <div><p className="text-[11px] text-muted-foreground">PICKUP</p><p className="text-sm font-medium">{request.pickup_location}</p></div>
            <div><p className="text-[11px] text-muted-foreground">DESTINATION</p><p className="text-sm font-medium">{request.destination}</p></div>
          </div>
        </div>
      </div>

      <div className="bg-white rounded-2xl border border-border p-4 space-y-3">
        <h2 className="text-sm font-semibold">Cargo details</h2>
        <div className="grid grid-cols-2 gap-3 text-sm">
          <div><p className="text-xs text-muted-foreground">Weight</p><p className="font-medium">{request.cargo_weight || "—"}</p></div>
          <div><p className="text-xs text-muted-foreground">Budget</p><p className="font-medium">{formatMoney(request.budget)}</p></div>
          <div><p className="text-xs text-muted-foreground">Timing</p><p className="font-medium capitalize">{request.timing === "scheduled" ? formatDate(request.scheduled_date) : "Now"}</p></div>
          <div><p className="text-xs text-muted-foreground">Agreed price</p><p className="font-medium">{formatMoney(request.accepted_price)}</p></div>
        </div>
        {request.cargo_description && <p className="text-sm text-muted-foreground pt-1 border-t border-border">{request.cargo_description}</p>}
      </div>

      {showOffers && (
        <div>
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-base font-semibold">Driver offers</h2>
            <span className="text-xs text-muted-foreground">{pendingOffers.length} received</span>
          </div>
          {pendingOffers.length === 0 ? (
            <div className="bg-white rounded-2xl border border-border">
              <EmptyState icon={Truck} title="Waiting for offers" subtitle="Drivers nearby will send you quotes. Check back shortly." />
            </div>
          ) : (
            <div className="space-y-3">
              {pendingOffers.slice().sort((a, b) => sortBy === "rating" ? (b.driver_rating || 0) - (a.driver_rating || 0) : a.price - b.price).map((o) => (
                <div key={o.id} className="bg-white rounded-2xl border-2 border-border p-4">
                  <div className="flex items-start justify-between mb-3">
                    <div>
                      <p className="text-sm font-semibold">{o.driver_name}</p>
                      <StarRating value={o.driver_rating || 0} />
                    </div>
                    <p className="text-lg font-bold text-primary">{formatMoney(o.price)}</p>
                  </div>
                  <div className="flex gap-2">
                    <Button onClick={() => acceptOffer(o)} disabled={accepting === o.id} className="flex-1 h-11 font-semibold">
                      {accepting === o.id ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" />Accepting...</> : "Accept offer"}
                    </Button>
                    <Button variant="outline" size="icon" className="h-11 w-11" onClick={openChat}>
                      <MessageCircle className="w-4 h-4" />
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {showTracking && (
        <div className="bg-white rounded-2xl border border-border p-4">
          <h2 className="text-sm font-semibold mb-4">Delivery tracking</h2>
          <div className="space-y-0">
            {STATUS_FLOW.map((step, i) => {
              const done = i <= activeStep;
              return (
                <div key={step} className="flex gap-3">
                  <div className="flex flex-col items-center">
                    <span className={cn("w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold", done ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground")}>
                      {done ? <Check className="w-3.5 h-3.5" /> : i + 1}
                    </span>
                    {i < STATUS_FLOW.length - 1 && <span className={cn("w-0.5 h-8", done ? "bg-primary" : "bg-border")} />}
                  </div>
                  <div className="pt-1 pb-2">
                    <p className={cn("text-sm font-medium", done ? "text-foreground" : "text-muted-foreground")}>{STATUS_LABELS[step]}</p>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {acceptedOffer && (
        <div className="bg-white rounded-2xl border border-border p-4">
          <h2 className="text-sm font-semibold mb-3">Your driver</h2>
          <p className="text-sm font-semibold">{acceptedOffer.driver_name}</p>
          <Button variant="outline" className="w-full h-11 mt-3" onClick={openChat}>
            <MessageCircle className="w-4 h-4 mr-2" /> Message driver
          </Button>
        </div>
      )}

      {request.status !== "completed" && request.status !== "cancelled" && (
        <button onClick={cancelRequest} className="w-full text-xs font-medium text-muted-foreground hover:text-destructive py-2 transition-colors">
          Cancel this request
        </button>
      )}

      {request.status === "completed" && (
        <div className="bg-white rounded-2xl border border-border p-4">
          <h2 className="text-sm font-semibold mb-1">Rate your driver</h2>
          {alreadyRated ? (
            <p className="text-sm text-emerald-600 flex items-center gap-1.5 mt-2"><Check className="w-4 h-4" /> You've rated this trip. Thanks!</p>
          ) : (
            <div className="space-y-4 mt-3">
              <div className="flex gap-1.5">
                {[1, 2, 3, 4, 5].map((n) => (
                  <button key={n} onClick={() => setRating(n)} className="p-0.5">
                    <Star className={cn("w-9 h-9 transition-colors", n <= rating ? "text-amber-400 fill-amber-400" : "text-slate-200")} />
                  </button>
                ))}
              </div>
              <Textarea placeholder="Leave a comment (optional)" value={comment} onChange={(e) => setComment(e.target.value)} rows={2} />
              <Button onClick={submitRating} disabled={!rating || submittingRating} className="w-full h-11 font-semibold">
                {submittingRating ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" />Submitting...</> : "Submit rating"}
              </Button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}