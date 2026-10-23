import { useEffect, useState } from 'react';

// Shared by auth, role checks and driver pages so a stalled connection always
// offers a way back without clearing the driver's saved session.
export default function LoadingScreen() {
  const [takingLong, setTakingLong] = useState(false);

  useEffect(() => {
    const timer = setTimeout(() => setTakingLong(true), 15000);
    return () => clearTimeout(timer);
  }, []);

  return (
    <div className="fixed inset-0 flex flex-col items-center justify-center gap-4 bg-background p-6" role="status" aria-live="polite">
      <div className="w-8 h-8 border-4 border-muted border-t-primary rounded-full animate-spin" aria-label="Loading" />
      {takingLong && (
        <div className="text-center space-y-3">
          <p className="text-sm text-muted-foreground">This is taking longer than expected. Check your internet connection, then try again.</p>
          <button type="button" onClick={() => window.location.reload()} className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground">
            Reload MoveZW
          </button>
        </div>
      )}
    </div>
  );
}
