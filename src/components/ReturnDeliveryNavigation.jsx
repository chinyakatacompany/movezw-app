import React, { useEffect, useRef, useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '@/lib/AuthContext';
import { supabase } from '@/api/supabaseClient';

export default function ReturnDeliveryNavigation() {
  const { user } = useAuth();
  return ['driver', 'customer'].includes(user?.role) ? <Navigation key={user.id} user={user} /> : null;
}

function Navigation({ user }) {
  const navigate = useNavigate();
  const location = useLocation();
  const path = useRef(location.pathname);
  path.current = location.pathname;
  const [jobs, setJobs] = useState([]);
  useEffect(() => {
    let active = true;
    let running = false;
    const key = `return-delivery-opened:${user.id}`;
    let opened;
    try { opened = new Set(JSON.parse(localStorage.getItem(key) || '[]')); } catch { opened = new Set(); }
    const refresh = async () => {
      if (running) return;
      running = true;
      try {
        const { data, error } = await supabase.from('return_load_deliveries').select('*')
          .eq(user.role === 'driver' ? 'driver_id' : 'customer_id', user.id)
          .neq('status', 'completed').order('created_at', { ascending: false });
        if (!active) return;
        if (error) { console.error('Could not load return deliveries:', error); return; }
        setJobs(data);
        // While viewing one delivery, leave other jobs available through the banner.
        const viewing = path.current.startsWith('/return-loads/delivery/');
        if (viewing) opened.add(path.current.split('/').pop());
        const unseen = data.find((job) => !opened.has(job.id));
        if (!viewing && unseen) {
          opened.add(unseen.id);
          navigate(`/return-loads/delivery/${unseen.id}`);
        }
        try { localStorage.setItem(key, JSON.stringify([...opened])); } catch { /* session state retained */ }
      } catch (error) {
        console.error('Could not refresh return deliveries:', error);
      } finally { running = false; }
    };
    const channel = supabase.channel(`return-delivery-navigation-${user.id}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'return_load_deliveries', filter: `${user.role === 'driver' ? 'driver_id' : 'customer_id'}=eq.${user.id}` }, refresh)
      .subscribe((status) => { if (status === 'SUBSCRIBED') void refresh(); });
    void refresh();
    const resume = () => { if (document.visibilityState === 'visible') void refresh(); };
    const timer = setInterval(resume, 10000);
    document.addEventListener('visibilitychange', resume);
    return () => { active = false; clearInterval(timer); document.removeEventListener('visibilitychange', resume); supabase.removeChannel(channel); };
  }, [user.id, user.role, navigate]);
  if (!['/driver', '/customer', '/return-loads', '/return-loads/manage'].includes(location.pathname) || !jobs.length) return null;
  return <aside className="fixed bottom-24 right-4 z-40 max-w-[90vw] max-h-48 overflow-auto rounded-xl bg-primary text-primary-foreground p-3 shadow-lg">
    {jobs.map((job) => <Link key={job.id} to={`/return-loads/delivery/${job.id}`} className="block p-2 text-sm font-semibold">Open return delivery: {job.destination}</Link>)}
  </aside>;
}
