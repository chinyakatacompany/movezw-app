import React, { createContext, useState, useContext, useEffect } from 'react';
import { toast as sonnerToast } from 'sonner';
import { supabase } from '@/api/supabaseClient';
import { playNotificationChime, unlockAudioOnFirstGesture } from '@/lib/sound';

const AuthContext = createContext();

// Retain navigation for urgent driver notifications. Customer new-offer
// notifications are handled separately by CustomerOfferInbox below.
const AUTO_NAVIGATE_TYPES = new Set(['new_offer', 'offer_accepted']);

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(null);
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [isLoadingAuth, setIsLoadingAuth] = useState(true);
  const [isLoadingPublicSettings, setIsLoadingPublicSettings] = useState(false);
  const [authError, setAuthError] = useState(null);
  const [authChecked, setAuthChecked] = useState(false);
  const [appPublicSettings] = useState({});
  const [autoNavigateLink, setAutoNavigateLink] = useState(null);

  const clearAutoNavigate = () => setAutoNavigateLink(null);

  useEffect(() => {
    unlockAudioOnFirstGesture();
    checkUserAuth();

    const { data: listener } = supabase.auth.onAuthStateChange((_event, session) => {
      if (session?.user) {
        loadUserProfile(session.user);
      } else {
        setUser(null);
        setIsAuthenticated(false);
        setAuthChecked(true);
        setIsLoadingAuth(false);
      }
    });

    return () => {
      listener?.subscription?.unsubscribe();
    };
  }, []);

  const loadUserProfile = async (authUser) => {
    try {
      const { data: profile, error } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', authUser.id)
        .single();

      if (error) throw error;

      // Register.jsx stashes the phone number entered at signup here since it
      // isn't part of the auth payload; persist it into the profile once, on
      // the first login after email confirmation.
      let phone = profile?.phone || '';
      const pendingPhone = sessionStorage.getItem('movzw_signup_phone');
      if (pendingPhone && !phone) {
        const { error: phoneErr } = await supabase
          .from('profiles')
          .update({ phone: pendingPhone })
          .eq('id', authUser.id);
        if (!phoneErr) phone = pendingPhone;
        sessionStorage.removeItem('movzw_signup_phone');
      }

      // sessionStorage isn't cleared on logout, so a stale "driver" flag
      // left over from testing a driver signup earlier in this same browser
      // tab could silently promote an unrelated account that logs in
      // afterward (this happened — see git history). Register.jsx tags the
      // flag with the exact account id it belongs to, so it's only ever
      // applied below when that id matches the account actually logging in.
      let role = profile?.role || 'customer';
      const pendingRole = sessionStorage.getItem('movzw_signup_role');
      const pendingRoleOwner = sessionStorage.getItem('movzw_signup_user_id');
      if (pendingRole === 'driver' && pendingRoleOwner === authUser.id && role === 'customer') {
        const { error: roleErr } = await supabase
          .from('profiles')
          .update({ role: 'driver' })
          .eq('id', authUser.id);
        if (!roleErr) role = 'driver';
      }

      // Register.jsx requires the terms checkbox to submit, but can't persist
      // it itself (no session exists until after email confirmation) — so it
      // stashes intent here, tagged with the owner id like the role flag
      // above, and it's applied on the first real login. TermsGate still
      // catches anyone this doesn't reach (confirmed on a different
      // device/browser, or any pre-existing account from before this
      // feature shipped).
      let termsAcceptedAt = profile?.terms_accepted_at || null;
      const pendingTerms = sessionStorage.getItem('movzw_signup_terms_accepted');
      if (pendingTerms === '1' && pendingRoleOwner === authUser.id && !termsAcceptedAt) {
        const now = new Date().toISOString();
        const { error: termsErr } = await supabase
          .from('profiles')
          .update({ terms_accepted_at: now })
          .eq('id', authUser.id);
        if (!termsErr) termsAcceptedAt = now;
      }

      // customer-relogin (Login.jsx) assigns customers a synthetic,
      // never-emailed address ending in @relogin.movezw.internal purely so
      // it can reuse Supabase's email/password sign-in path — it's an
      // internal auth implementation detail, never a real address, so it
      // must never surface in the UI (Profile.jsx's email row, "from"
      // fields, etc.) the way a real driver email would.
      const realEmail = authUser.email && !authUser.email.endsWith('@relogin.movezw.internal') ? authUser.email : null;

      setUser({
        id: authUser.id,
        email: realEmail,
        full_name: profile?.full_name || authUser.user_metadata?.full_name || '',
        phone,
        role,
        is_suspended: profile?.is_suspended || false,
        terms_accepted_at: termsAcceptedAt,
      });
      setIsAuthenticated(true);
      setAuthError(null);
    } catch (err) {
      console.error('Failed to load profile:', err);
      setAuthError({ type: 'unknown', message: err.message });
    } finally {
      setIsLoadingAuth(false);
      setAuthChecked(true);
    }
  };

  const checkUserAuth = async () => {
    setIsLoadingAuth(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (session?.user) {
        await loadUserProfile(session.user);
      } else {
        setUser(null);
        setIsAuthenticated(false);
        setAuthChecked(true);
        setIsLoadingAuth(false);
      }
    } catch (err) {
      setAuthError({ type: 'unknown', message: err.message });
      setIsLoadingAuth(false);
      setAuthChecked(true);
    }
  };

  const checkAppState = async () => {
    setIsLoadingPublicSettings(false);
    await checkUserAuth();
  };

  // Pop up a dismissible toast (with an audible chime) the moment a new
  // notification row is inserted for this user — covers both customer and
  // driver accounts since this listener runs for whoever is logged in.
  // Reusing the same toast id means a fresh popup replaces whatever's
  // currently showing instead of stacking up.
  useEffect(() => {
    if (!user?.id) return;
    const channel = supabase
      .channel(`notifications-popup-${user.id}`)
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'notifications', filter: `user_id=eq.${user.id}` },
        (payload) => {
          const n = payload.new;
          // Customer bids have a persistent queue above the router. Do not
          // replace them with transient toasts or navigate away from forms.
          if (user.role === 'customer' && n.type === 'new_offer') return;
          playNotificationChime();
          sonnerToast(n.title, {
            id: 'notification-popup',
            description: n.message,
            action: n.link ? { label: 'View', onClick: () => { window.location.href = n.link; } } : undefined,
          });
          if (n.link && AUTO_NAVIGATE_TYPES.has(n.type)) {
            setAutoNavigateLink(n.link);
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [user?.id, user?.role]);

  const logout = async () => {
    await supabase.auth.signOut();
    setUser(null);
    setIsAuthenticated(false);
    window.location.href = '/login';
  };

  const navigateToLogin = () => {
    window.location.href = '/login';
  };

  return (
    <AuthContext.Provider value={{
      user,
      isAuthenticated,
      isLoadingAuth,
      isLoadingPublicSettings,
      authError,
      appPublicSettings,
      authChecked,
      logout,
      navigateToLogin,
      checkUserAuth,
      checkAppState,
      autoNavigateLink,
      clearAutoNavigate
    }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};
