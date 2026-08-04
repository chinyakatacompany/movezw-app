import React, { createContext, useState, useContext, useEffect } from 'react';
import { toast as sonnerToast } from 'sonner';
import { supabase } from '@/api/supabaseClient';
import { playNotificationChime, unlockAudioOnFirstGesture } from '@/lib/sound';

const AuthContext = createContext();

// Notification types that need the customer/driver's attention on a
// specific page right now — e.g. a quote just came in and needs an
// accept/reject decision — so we jump them there automatically instead of
// requiring a tap through the notification panel first.
const AUTO_NAVIGATE_TYPES = new Set(['new_offer']);

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

      // Google sign-in can't seed role into handle_new_user() the way
      // email/password signup does (Register.jsx passes it via signUp's
      // user metadata) — this is the fallback for that path, and a safety
      // net generally, promoting a still-default 'customer' profile to
      // 'driver' if that's what was chosen at signup and sessionStorage
      // survived to this login.
      let role = profile?.role || 'customer';
      const pendingRole = sessionStorage.getItem('movzw_signup_role');
      if (pendingRole === 'driver' && role === 'customer') {
        const { error: roleErr } = await supabase
          .from('profiles')
          .update({ role: 'driver' })
          .eq('id', authUser.id);
        if (!roleErr) role = 'driver';
      }

      setUser({
        id: authUser.id,
        email: authUser.email,
        full_name: profile?.full_name || authUser.user_metadata?.full_name || '',
        phone,
        role,
        is_suspended: profile?.is_suspended || false,
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
  }, [user?.id]);

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