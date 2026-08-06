import React, { useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { supabase } from "@/api/supabaseClient";
import { useAuth } from "@/lib/AuthContext";
import { ArrowLeft, Star, Check, Loader2, Truck, MessageCircle, Phone, MapPin, Navigation, User as UserIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { StatusBadge, StarRating, STATUS_FLOW, STATUS_LABELS, formatMoney, timeAgo, formatDate, VEHICLE_ICONS, createNotification, EmptyState } from "@/lib/movezw";
import { getOrCreateConversation } from "@/lib/messaging";
import { toast } from "@/components/ui/use-toast";
import { cn } from "@/lib/utils";
const RouteMap = React.lazy(() => import("@/components/RouteMap"));

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
  const [driverPhone, setDriverPhone] = useState(null);

  const load = async () => {
    const { data: req } = await supabase.from("transport_requests").select("*").eq("id", id).single();
    const { data: offs } = await supabase.from("offers").select("*").eq("request_id", id).order("price");
    setRequest(req);
    setOffers(offs || []);
    setLoading(false);

    if (req?.accepted_driver_id) {
      const { data: phone } = await supabase.rpc("fn_get_trip_contact_phone", { p_request_id: req.id });
      setDriverPhone(phone || null);
    }
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
     
  }, [id]);

  useEffect(() => {
    if (!request?.status || request.status !== "completed" || !user?.id) return;
    supabase.from("ratings").select("id").eq("request_id", request.id).eq("customer_id", user.id)
      .then(({ data }) => setAlreadyRated((data || []).length > 0));
  }, [request?.id, request?.status, user?.id]);

  // For a pending offer, message that specific driver. Once a driver is
  // accepted, calling this with no offer messages the accepted driver.
  const openChat = async (offer) => {
    const driverId = offer?.driver_id || request.accepted_driver_id;
    const driverName = offer?.driver_name || acceptedOffer?.driver_name;
    if (!driverId) return;
    try {
      const conv = await getOrCreateConversation({
        request,
        driverId,
        driverName,
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
  const enRouteOrLater = activeStep >= STATUS_FLOW.indexOf("en_route_pickup");
  const acceptedOffer = offers?.find((o) => o.id === request.accepted_offer_id);
  const pendingOffers = offers?.filter((o) => o.status === "pending") || [];
  const showOffers = request.status === "open";
  const showTracking = STATUS_FLOW.includes(request.status) || request.status === "completed";
  const hasFullRoute = request.pickup_lat != null && request.pickup_lng != null && request.destination_lat != null && request.destination_lng != null;
  // Live driver position, refreshed every 5 minutes by the driver's app —
  // heads to pickup while en route, then to the destination once collected.
  const trackingTarget = request.status === "en_route_pickup"
    ? { lat: request.pickup_lat, lng: request.pickup_lng, label: "Pickup" }
    : { lat: request.destination_lat, lng: request.destination_lng, label: "Destination" };
  const showLiveTracking = enRouteOrLater
    && !["delivered", "completed", "cancelled"].includes(request.status)
    && request.driver_lat != null && request.driver_lng != null
    && trackingTarget.lat != null && trackingTarget.lng != null;

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

      <div className="bg-card rounded-2xl border border-border p-4 space-y-3">
        <div className="flex gap-3">
          <div className="flex flex-col items-center pt-1">
            <span className="w-2.5 h-2.5 rounded-full bg-primary" />
            <span className="w-0.5 flex-1 bg-border my-1" />
            <span className="w-2.5 h-2.5 rounded-full bg-emerald-500" />
          </div>
          <div className="flex-1 space-y-3 pb-1">
            <div>
              <p className="text-[11px] text-muted-foreground">PICKUP</p>
              <p className="text-sm font-medium">{request.pickup_location}</p>
              {!hasFullRoute && request.pickup_lat != null && request.pickup_lng != null && (
                <a
                  href={`https://www.openstreetmap.org/?mlat=${request.pickup_lat}&mlon=${request.pickup_lng}#map=17/${request.pickup_lat}/${request.pickup_lng}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1.5 text-sm font-semibold text-primary bg-primary/10 border-2 border-primary/30 rounded-xl px-3 py-2 mt-1.5 hover:bg-primary/15 transition-colors"
                >
                  <MapPin className="w-4 h-4" /> View exact location on map
                </a>
              )}
            </div>
            <div><p className="text-[11px] text-muted-foreground">DESTINATION</p><p className="text-sm font-medium">{request.destination}</p></div>
          </div>
        </div>
        {hasFullRoute && (
          <React.Suspense fallback={<div className="h-[260px] rounded-xl bg-muted animate-pulse" />}>
            <RouteMap
              from={{ lat: request.pickup_lat, lng: request.pickup_lng }}
              to={{ lat: request.destination_lat, lng: request.destination_lng }}
              fromLabel="Pickup"
              toLabel="Destination"
            />
          </React.Suspense>
        )}
      </div>

      <div className="bg-card rounded-2xl border border-border p-4 space-y-3">
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
            <div className="bg-card rounded-2xl border border-border">
              <EmptyState icon={Truck} title="Waiting for offers" subtitle="Drivers nearby will send you quotes. Check back shortly." />
            </div>
          ) : (
            <div className="space-y-3">
              {pendingOffers.slice().sort((a, b) => sortBy === "rating" ? (b.driver_rating || 0) - (a.driver_rating || 0) : a.price - b.price).map((o) => (
                <div key={o.id} className="bg-card rounded-2xl border-2 border-border p-4">
                  <div className="flex items-start justify-between mb-3">
                    <div className="flex items-center gap-3">
                      <div className="w-11 h-11 rounded-full bg-primary/10 flex items-center justify-center overflow-hidden shrink-0">
                        {o.driver_photo_url ? (
                          <img src={o.driver_photo_url} alt="" className="w-full h-full object-cover" />
                        ) : (
                          <UserIcon className="w-5 h-5 text-primary" />
                        )}
                      </div>
                      <div>
                        <p className="text-sm font-semibold">{o.driver_name}</p>
                        <StarRating value={o.driver_rating || 0} />
                      </div>
                    </div>
                    <p className="text-lg font-bold text-primary">{formatMoney(o.price)}</p>
                  </div>
                  {(o.vehicle_name || o.vehicle_type || o.license_plate) && (
                    <p className="text-xs text-muted-foreground mb-3">
                      {VEHICLE_ICONS[o.vehicle_type] ? `${VEHICLE_ICONS[o.vehicle_type]} ` : ""}
                      {[o.vehicle_name, o.vehicle_type].filter(Boolean).join(" ")}
                      {o.license_plate ? ` · ${o.license_plate}` : ""}
                    </p>
                  )}
                  <div className="flex gap-2">
                    <Button onClick={() => acceptOffer(o)} disabled={accepting === o.id} className="flex-1 h-11 font-semibold">
                      {accepting === o.id ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" />Accepting...</> : "Accept offer"}
                    </Button>
                    <Button variant="outline" size="icon" className="h-11 w-11" onClick={() => openChat(o)}>
                      <MessageCircle className="w-4 h-4" />
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {showLiveTracking && (
        <div className="bg-card rounded-2xl border border-border p-4 space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-semibold flex items-center gap-2"><Navigation className="w-4 h-4 text-primary" /> Live driver location</h2>
            <span className="text-[11px] text-muted-foreground">Updated {timeAgo(request.driver_location_updated_at)}</span>
          </div>
          <React.Suspense fallback={<div className="h-[260px] rounded-xl bg-muted animate-pulse" />}>
            <RouteMap
              from={{ lat: request.driver_lat, lng: request.driver_lng }}
              to={{ lat: trackingTarget.lat, lng: trackingTarget.lng }}
              fromLabel="Your driver"
              toLabel={trackingTarget.label}
              fromColor="#ea580c"
            />
          </React.Suspense>
        </div>
      )}

      {showTracking && (
        <div className="bg-card rounded-2xl border border-border p-4">
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
        <div className="bg-card rounded-2xl border border-border p-4">
          <h2 className="text-sm font-semibold mb-3">Your driver</h2>
          <p className="text-sm font-semibold">{acceptedOffer.driver_name}</p>
          {enRouteOrLater ? (
            <div className="grid grid-cols-2 gap-2 mt-3">
              <Button variant="outline" className="h-11" onClick={() => openChat()}>
                <MessageCircle className="w-4 h-4 mr-2" /> Message
              </Button>
              {driverPhone ? (
                <a href={`tel:${driverPhone}`} className="inline-flex items-center justify-center h-11 rounded-xl border border-input bg-background shadow-sm hover:bg-accent hover:text-accent-foreground text-sm font-medium">
                  <Phone className="w-4 h-4 mr-2" /> Call
                </a>
              ) : (
                <Button variant="outline" className="h-11" disabled>
                  <Phone className="w-4 h-4 mr-2" /> Call
                </Button>
              )}
            </div>
          ) : (
            <p className="text-xs text-muted-foreground mt-2">Contact details will appear here once your driver is on the way to pickup.</p>
          )}
        </div>
      )}

      {request.status !== "completed" && request.status !== "cancelled" && (
        <button onClick={cancelRequest} className="w-full text-xs font-medium text-muted-foreground hover:text-destructive py-2 transition-colors">
          Cancel this request
        </button>
      )}

      {request.status === "completed" && (
        <div className="bg-card rounded-2xl border border-border p-4">
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