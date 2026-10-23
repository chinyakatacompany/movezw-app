import { useEffect, useState } from 'react';
import { useAuth } from '@/lib/AuthContext';
import { requestCurrentLocation } from '@/lib/geo';
import { DRIVER_LOCATION_STATUS_EVENT, reportDriverLocationStatus } from '@/lib/driverLocationStatus';
import { setLocationTrackingEnabled } from '@/lib/devicePreferences';

export default function DriverLocationNotice() {
  const { user } = useAuth();
  const [status, setStatus] = useState(null);
  const [requesting, setRequesting] = useState(false);
  useEffect(() => {
    setStatus(null);
    const receive = (event) => setStatus(event.detail);
    window.addEventListener(DRIVER_LOCATION_STATUS_EVENT, receive);
    return () => window.removeEventListener(DRIVER_LOCATION_STATUS_EVENT, receive);
  }, [user?.id]);
  if (user?.role !== 'driver' || !status || status.ready) return null;
  const enable = async () => {
    setRequesting(true);
    try {
      // Permission and the device GPS switch stay under Android's control.
      await requestCurrentLocation();
      setLocationTrackingEnabled(true);
      reportDriverLocationStatus(true);
    } catch (error) { setStatus({ ready: false, message: error.message }); }
    finally { setRequesting(false); }
  };
  return <aside role="alert" className="fixed bottom-20 left-2 right-2 z-[60] mx-auto max-w-lg rounded-xl border border-amber-300 bg-amber-50 p-3 text-amber-950 shadow-lg">
    <p className="text-sm font-semibold">Driver location needs attention</p>
    <p className="text-xs mt-1">{status.message} On Android: Settings → Apps → MoveZW → Permissions → Location → Allow while using the app. Keep the phone’s Location switch on.</p>
    <button type="button" disabled={requesting} onClick={() => { void enable(); }} className="mt-2 rounded-lg bg-amber-900 px-3 py-2 text-xs font-semibold text-white disabled:opacity-50">{requesting ? 'Checking GPS…' : 'Enable location / retry'}</button>
  </aside>;
}
