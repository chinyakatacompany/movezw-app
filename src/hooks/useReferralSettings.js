import { useEffect, useState } from 'react';
import { supabase } from '@/api/supabaseClient';
export function useReferralSettings() {
  const [enabled, setEnabled] = useState(null);
  useEffect(() => {
    let active = true;
    const load = async () => {
      const { data, error } = await supabase.from('driver_referral_settings').select('enabled').single();
      if (active) setEnabled(error ? null : Boolean(data?.enabled));
    };
    void load();
    const timer = setInterval(load, 15000);
    window.addEventListener('focus', load);
    return () => { active = false; clearInterval(timer); window.removeEventListener('focus', load); };
  }, []);
  return enabled;
}
