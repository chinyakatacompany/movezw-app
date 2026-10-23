import { useEffect } from 'react';
import { supabase } from '@/api/supabaseClient';

// Realtime is fastest; polling and resume recover missed events/offline edits.
export function useDriverProfileRefresh(userId, onProfile) {
  useEffect(() => {
    if (!userId) return;
    let alive = true;
    let running = false;
    const refresh = async () => {
      if (running) return;
      running = true;
      try {
        const { data, error } = await supabase.from('driver_profiles').select('*').eq('user_id', userId).order('created_at', { ascending: false }).limit(1);
        if (!error && alive) onProfile(data?.[0] || null);
      } catch (error) { console.error('Profile refresh failed', error); } finally { running = false; }
    };
    const resume = () => { if (document.visibilityState === 'visible') void refresh(); };
    const channel = supabase.channel(`driver-profile-live-${userId}-${Math.random()}`).on('postgres_changes', { event: '*', schema: 'public', table: 'driver_profiles', filter: `user_id=eq.${userId}` }, refresh).subscribe(status => { if (status === 'SUBSCRIBED') void refresh(); });
    void refresh();
    const timer = setInterval(resume, 5000);
    window.addEventListener('focus', resume);
    document.addEventListener('visibilitychange', resume);
    return () => { alive = false; clearInterval(timer); window.removeEventListener('focus', resume); document.removeEventListener('visibilitychange', resume); supabase.removeChannel(channel); };
  }, [userId, onProfile]);
}
