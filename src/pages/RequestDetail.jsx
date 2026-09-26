import React, { useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { supabase } from "@/api/supabaseClient";
import { useAuth } from "@/lib/AuthContext";
import { useUnexpiredRequests } from "@/lib/useUnexpiredRequests";
import { ArrowLeft, Star, Check, Loader2, Truck, MessageCircle, Phone, MapPin, Navigation, User as UserIcon, Eye } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { StatusBadge, StarRating, STATUS_FLOW, STATUS_LABELS, formatMoney, timeAgo, formatDate, VEHICLE_ICONS, createNotification, EmptyState } from "@/lib/movezw";
import { getOrCreateConversation } from "@/lib/messaging";
import { acceptOffer as acceptOfferRpc, cancelTransportRequest } from "@/lib/payments";
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
  const [storedRequest, setRequest] = useState(null);
  const request = useUnexpiredRequests(storedRequest ? [storedRequest] : [])[0] || null;
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
  const [viewerCount, setViewerCount] = useState(0);
  const [showAcceptedDetails, setShowAcceptedDetails] = useState(false);

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

  // Joins the same presence channel drivers track while browsing this open
  // job (see DriverJobDetail.jsx) in read-only mode — never calls .track()
  // here, just watches who's currently present — to show live "N drivers
  // viewing" social proof while offers are still coming in.
  useEffect(() => {
    if (!id || request?.status !== "open") { setViewerCount(0); return; }
    const channel = supabase.channel(`job-presence-${id}`, { config: { presence: { key: user?.id || "customer" } } });
    const updateCount = () => setViewerCount(Object.keys(channel.presenceState()).length);
    channel
      .on("presence", { event: "sync" }, updateCount)
      .on("presence", { event: "join" }, updateCount)
      .on("presence", { event: "leave" }, updateCount)
      .subscribe();
    return () => { supabase.removeChannel(channel); setViewerCount(0); };
  }, [id, request?.status, user?.id]);

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
      // Confirming the request and reserving the driver's commission from
      // their wallet now happen atomically in one RPC — see fn_accept_offer.
      // Throws if the driver's balance is below the low-balance threshold.
      await acceptOfferRpc({ offerId: offer.id });

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
      // Cancelling and refunding any already-reserved commission happen
      // atomically — see fn_cancel_transport_request. Auto-refunds if the
      // driver hadn't collected the cargo yet; otherwise queues it for
      // admin approval.
      const result = await cancelTransportRequest({ requestId: request.id });
      if (result?.refund === "auto") {
        toast({ title: "Request cancelled", description: `The driver's $${result.amount} commission was refunded automatically.` });
      } else if (result?.refund === "pending") {
        toast({ title: "Request cancelled", description: "The driver's commission refund is pending admin approval, since the cargo was already collected." });
      } else {
        toast({ title: "Request cancelled" });
      }
      load();
    } catch (e) {
      toast({ title: "Could not cancel", description: e.message, variant: "destructive" });
    }
  };

  if (loading) {
    return <div className="p-4 flex items-center justify-center py-32"><Loader2 className="w-6 h-6 text-primary animate-spin" /></div>;
  }
  if (!request) return <div className="p-8 text-center text-muted-foreground">Request not found.</div>;

  const activeStep = request.status === "delivered"
    ? STATUS_FLOW.indexOf("in_transit")
    : STATUS_FLOW.indexOf(request.status);
  const acceptedOffer = offers?.find((o) => o.id === request.accepted_offer_id);
  const pendingOffers = offers?.filter((o) => o.status === "pending") || [];
  const showOffers = request.status === "open";
  const showTracking = STATUS_FLOW.includes(request.status) || ["delivered", "completed"].includes(request.status);
  const hasFullRoute = request.pickup_lat != null && request.pickup_lng != null && request.destination_lat != null && request.destination_lng != null;
  // Live driver position, refreshed every 5 minutes by the driver's app —
  // heads to pickup while en route, then to the destination once collected.
  const trackingTarget = ["confirmed", "en_route_pickup"].includes(request.status)
    ? { lat: request.pickup_lat, lng: request.pickup_lng, label: "Pickup" }
    : { lat: request.destination_lat, lng: request.destination_lng, label: "Destination" };
  const showCustomerTracking = Boolean(request.accepted_driver_id)
    && !["delivered", "completed", "cancelled"].includes(request.status)
    && STATUS_FLOW.includes(request.status);
  const hasLivePosition = request.driver_lat != null && request.driver_lng != null;

  if (showCustomerTracking) {
    const resolvedTrackingTarget = trackingTarget.lat != null && trackingTarget.lng != null ? trackingTarget : null;
    return (
      <div className="fixed inset-0 z-40 bg-muted overflow-hidden">
        {hasLivePosition ? (
          <React.Suspense fallback={<div className="absolute inset-0 bg-muted animate-pulse" />}>
            <RouteMap
              from={{ lat: request.driver_lat, lng: request.driver_lng }}
              to={resolvedTrackingTarget}
              fromLabel="Your driver"
              toLabel={resolvedTrackingTarget?.label || "Route target"}
              fromColor="#ea580c"
              height="100dvh"
              immersive
            />
          </React.Suspense>
        ) : (
          <div className="absolute inset-0 flex flex-col items-center justify-center text-center px-8 bg-slate-100">
            <Navigation className="w-12 h-12 text-primary mb-3" />
            <p className="text-lg font-bold">Waiting for the driver's location</p>
            <p className="text-sm text-muted-foreground mt-2 max-w-sm">The map will open automatically as soon as the driver's GPS sends its first position.</p>
          </div>
        )}

        <div className="absolute top-0 inset-x-0 p-3 pt-[max(0.75rem,env(safe-area-inset-top))] bg-gradient-to-b from-black/65 to-transparent">
          <div className="flex items-center gap-3">
            <button onClick={() => navigate("/customer")} aria-label="Exit tracking" className="w-11 h-11 rounded-full bg-white text-slate-900 shadow-lg flex items-center justify-center">
              <ArrowLeft className="w-5 h-5" />
            </button>
            <div className="flex-1 min-w-0 rounded-2xl bg-primary text-primary-foreground px-4 py-2.5 shadow-lg text-center">
              <p className="text-[10px] font-semibold text-primary-foreground/75">LIVE DELIVERY TRACKING</p>
              <p className="font-bold truncate">{STATUS_LABELS[request.status]}</p>
            </div>
          </div>
        </div>

        <div className="absolute left-3 top-28 flex flex-col gap-3">
          <button onClick={() => setShowAcceptedDetails(true)} className="w-16 min-h-16 rounded-2xl bg-white/95 shadow-lg border border-border flex flex-col items-center justify-center gap-1 px-1 text-[11px] font-bold text-slate-900">
            <Truck className="w-5 h-5 text-primary" /> View offer
          </button>
          {driverPhone && (
            <a href={`tel:${driverPhone}`} className="w-16 min-h-16 rounded-2xl bg-white/95 shadow-lg border border-border flex flex-col items-center justify-center gap-1 text-[11px] font-bold text-slate-900">
              <Phone className="w-5 h-5 text-primary" /> Call
            </a>
          )}
          <button onClick={() => openChat()} className="w-16 min-h-16 rounded-2xl bg-white/95 shadow-lg border border-border flex flex-col items-center justify-center gap-1 text-[11px] font-bold text-slate-900">
            <MessageCircle className="w-5 h-5 text-primary" /> Message
          </button>
        </div>

        <div className="absolute bottom-0 inset-x-0 p-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] bg-gradient-to-t from-black/75 via-black/45 to-transparent">
          <div className="rounded-2xl bg-primary text-primary-foreground px-5 py-4 shadow-lg text-center">
            <p className="text-xs text-primary-foreground/75">CURRENT DELIVERY STATUS</p>
            <p className="text-lg font-bold">{STATUS_LABELS[request.status]}</p>
            <p className="text-xs text-primary-foreground/80 mt-1">
              {request.driver_location_updated_at ? `Driver location updated ${timeAgo(request.driver_location_updated_at)}` : "Waiting for the first GPS update"}
            </p>
          </div>
        </div>

        {showAcceptedDetails && (
          <div className="fixed inset-0 z-50 bg-background overflow-y-auto">
            <div className="sticky top-0 z-10 h-14 px-4 bg-header text-header-foreground flex items-center gap-3 shadow">
              <button onClick={() => setShowAcceptedDetails(false)} className="w-9 h-9 rounded-full flex items-center justify-center hover:bg-white/10" aria-label="Back to tracking">
                <ArrowLeft className="w-5 h-5" />
              </button>
              <h1 className="font-bold">Accepted offer and job details</h1>
            </div>
            <div className="p-4 space-y-4 max-w-2xl mx-auto pb-10">
              <div className="bg-card rounded-2xl border border-border p-4">
                <p className="text-xs text-muted-foreground">ACCEPTED DRIVER</p>
                <p className="text-lg font-bold mt-1">{acceptedOffer?.driver_name || "Your driver"}</p>
                <p className="text-3xl font-bold text-primary mt-3">{formatMoney(request.accepted_price ?? acceptedOffer?.price)}</p>
                {acceptedOffer?.vehicle_type && <p className="text-sm text-muted-foreground mt-1">{acceptedOffer.vehicle_type}</p>}
                {acceptedOffer?.note && <p className="text-sm mt-3 pt-3 border-t border-border">{acceptedOffer.note}</p>}
              </div>
              <div className="bg-card rounded-2xl border border-border p-4 space-y-3">
                <div><p className="text-xs text-muted-foreground">PICKUP</p><p className="font-semibold text-primary">{request.pickup_location}</p></div>
                <div><p className="text-xs text-muted-foreground">DESTINATION</p><p className="font-semibold text-emerald-700">{request.destination}</p></div>
                <div><p className="text-xs text-muted-foreground">CARGO</p><p className="font-semibold">{request.cargo_type} · {request.cargo_weight || "Weight not specified"}</p></div>
              </div>
              <Button onClick={() => setShowAcceptedDetails(false)} className="w-full h-12 font-semibold">Back to live tracking</Button>
            </div>
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="p-4 pb-8 space-y-5">
      <button onClick={() => navigate("/customer")} className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft className="w-4 h-4" /> Exit to home
      </button>

      <div>
        <div className="flex items-center justify-between mb-2">
          <h1 className="text-xl font-bold">{request.cargo_type}</h1>
          <div className="flex items-center gap-1.5">
            {request.batch_total > 1 && (
              <span className="text-[11px] font-semibold text-accent bg-accent/10 px-2 py-1 rounded-full whitespace-nowrap">
                Load {request.batch_index} of {request.batch_total}
              </span>
            )}
            <StatusBadge status={request.status} />
          </div>
        </div>
        <p className="text-xs text-muted-foreground">Posted {timeAgo(request.created_at)}</p>
      </div>

      {showCustomerTracking && (
        <section className="bg-card rounded-2xl border-2 border-primary overflow-hidden shadow-lg">
          <div className="px-4 py-3 bg-primary text-primary-foreground flex items-center justify-between gap-3">
            <div>
              <p className="text-xs font-medium text-primary-foreground/80">LIVE DELIVERY TRACKING</p>
              <p className="font-bold">{STATUS_LABELS[request.status]}</p>
            </div>
            <span className="text-xs font-semibold bg-white/15 rounded-full px-3 py-1">
              {hasLivePosition && request.driver_location_updated_at
                ? `Updated ${timeAgo(request.driver_location_updated_at)}`
                : "Waiting for driver GPS"}
            </span>
          </div>

          {hasLivePosition ? (
            <React.Suspense fallback={<div className="h-[360px] bg-muted animate-pulse" />}>
              <RouteMap
                from={{ lat: request.driver_lat, lng: request.driver_lng }}
                to={trackingTarget}
                fromLabel="Your driver"
                toLabel={trackingTarget.label}
                fromColor="#ea580c"
                height={360}
              />
            </React.Suspense>
          ) : (
            <div className="h-52 flex flex-col items-center justify-center text-center px-6 bg-muted/40">
              <Navigation className="w-8 h-8 text-primary mb-2" />
              <p className="text-sm font-semibold">Waiting for the driver's live location</p>
              <p className="text-xs text-muted-foreground mt-1">This map will start automatically when the driver's GPS is available.</p>
            </div>
          )}

          <div className="p-3 border-t border-border">
            <div className="flex items-center gap-2 mb-3 overflow-x-auto">
              {STATUS_FLOW.slice(0, -1).map((step, index) => (
                <React.Fragment key={step}>
                  {index > 0 && <span className={cn("h-0.5 min-w-5 flex-1", index <= activeStep ? "bg-primary" : "bg-border")} />}
                  <span className={cn(
                    "w-7 h-7 rounded-full shrink-0 flex items-center justify-center text-[10px] font-bold",
                    index <= activeStep ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground"
                  )} title={STATUS_LABELS[step]}>
                    {index < activeStep ? <Check className="w-3.5 h-3.5" /> : index + 1}
                  </span>
                </React.Fragment>
              ))}
            </div>
            <div className="grid grid-cols-2 gap-2">
              <Button variant="outline" className="h-11" onClick={() => openChat()}>
                <MessageCircle className="w-4 h-4 mr-2" /> Message driver
              </Button>
              {driverPhone ? (
                <a href={`tel:${driverPhone}`} className="inline-flex items-center justify-center h-11 rounded-xl bg-primary text-primary-foreground text-sm font-semibold">
                  <Phone className="w-4 h-4 mr-2" /> Call driver
                </a>
              ) : (
                <Button className="h-11" disabled><Phone className="w-4 h-4 mr-2" /> Call driver</Button>
              )}
            </div>
          </div>
        </section>
      )}

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
          {viewerCount > 0 && (
            <div className="flex items-center gap-1.5 text-xs font-medium text-emerald-600 bg-emerald-500/10 rounded-full px-3 py-1.5 mb-3 w-fit">
              <span className="relative flex h-2 w-2">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-500 opacity-75" />
                <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500" />
              </span>
              <Eye className="w-3.5 h-3.5" />
              {viewerCount === 1 ? "1 driver viewing your job right now" : `${viewerCount} drivers viewing your job right now`}
            </div>
          )}
          {pendingOffers.length === 0 ? (
            <div className="bg-card rounded-2xl border border-border">
              <EmptyState icon={Truck} title="Waiting for driver quotes" subtitle="Keep this screen open and new quotes will appear automatically. You can also exit and return from Open jobs on Home." />
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
