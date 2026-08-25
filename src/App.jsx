import { useEffect } from 'react';
import { Toaster } from "@/components/ui/toaster"
import { QueryClientProvider } from '@tanstack/react-query'
import { queryClientInstance } from '@/lib/query-client'
import { BrowserRouter as Router, Route, Routes, Navigate, useNavigate } from 'react-router-dom';
import PageNotFound from './lib/PageNotFound';
import { AuthProvider, useAuth } from '@/lib/AuthContext';
import UserNotRegisteredError from '@/components/UserNotRegisteredError';
import ScrollToTop from './components/ScrollToTop';
import ProtectedRoute from '@/components/ProtectedRoute';
import RoleGuard from '@/components/RoleGuard';
import AppLayout from '@/components/AppLayout';
import AdminLayout from '@/components/AdminLayout';
import Landing from '@/pages/Landing';
import Login from '@/pages/Login';
import Register from '@/pages/Register';
import ForgotPassword from '@/pages/ForgotPassword';
import ResetPassword from '@/pages/ResetPassword';
import RoleHome from '@/pages/RoleHome';
import CustomerDashboard from '@/pages/CustomerDashboard';
import CreateRequest from '@/pages/CreateRequest';
import RequestDetail from '@/pages/RequestDetail';
import CustomerHistory from '@/pages/CustomerHistory';
import DriverDashboard from '@/pages/DriverDashboard';
import DriverOnboarding from '@/pages/DriverOnboarding';
import DriverJobDetail from '@/pages/DriverJobDetail';
import DriverHistory from '@/pages/DriverHistory';
import AdminDashboard from '@/pages/AdminDashboard';
import AdminVerification from '@/pages/AdminVerification';
import AdminAssistedOnboarding from '@/pages/AdminAssistedOnboarding';
import AdminUsers from '@/pages/AdminUsers';
import AdminJobs from '@/pages/AdminJobs';
import AdminReports from '@/pages/AdminReports';
import AdminAnalytics from '@/pages/AdminAnalytics';
import AdminFinance from '@/pages/AdminFinance';
import AdminContent from '@/pages/AdminContent';
import Notifications from '@/pages/Notifications';
import Profile from '@/pages/Profile';
import PaymentHistory from '@/pages/PaymentHistory';
import Support from '@/pages/Support';
import AlertSettings from '@/pages/AlertSettings';
import VehicleManagement from '@/pages/VehicleManagement';
import Terms from '@/pages/Terms';
import Privacy from '@/pages/Privacy';
import DeleteAccount from '@/pages/DeleteAccount';
import Messages from '@/pages/Messages';
import Chat from '@/pages/Chat';
import Wallet from '@/pages/Wallet';
import ComingSoon from '@/pages/ComingSoon';
import ReturnMarketplace from '@/pages/ReturnMarketplace';
import BookReturnLoad from '@/pages/BookReturnLoad';
import DriverReturnLoads from '@/pages/DriverReturnLoads';
import DriverLocationPing from '@/components/DriverLocationPing';
import NativePushRegistration from '@/components/NativePushRegistration';
import NativeAppBridge from '@/components/NativeAppBridge';
import ThemeLoader from '@/components/ThemeLoader';
import LoadingScreen from '@/components/LoadingScreen';

const AuthenticatedApp = () => {
  const { isLoadingAuth, isLoadingPublicSettings, authError, navigateToLogin, autoNavigateLink, clearAutoNavigate } = useAuth();
  const navigate = useNavigate();

  // A notification that needs attention right now (e.g. a new quote to
  // accept/reject) jumps the user straight to the relevant page instead of
  // requiring a tap through the notification panel — see AuthContext.jsx.
  useEffect(() => {
    if (!autoNavigateLink) return;
    navigate(autoNavigateLink);
    clearAutoNavigate();
  }, [autoNavigateLink, navigate, clearAutoNavigate]);

  // Show loading spinner while checking app public settings or auth
  if (isLoadingPublicSettings || isLoadingAuth) {
    return <LoadingScreen />;
  }

  // Handle authentication errors
  if (authError) {
    if (authError.type === 'user_not_registered') {
      return <UserNotRegisteredError />;
    } else if (authError.type === 'auth_required') {
      // Redirect to login automatically
      navigateToLogin();
      return null;
    }
  }

  // Render the main app
  return (
    <>
    <DriverLocationPing />
    <NativePushRegistration />
    <Routes>
      <Route path="/landing" element={<Landing />} />
      <Route path="/terms" element={<Terms />} />
      <Route path="/privacy" element={<Privacy />} />
      <Route path="/delete-account" element={<DeleteAccount />} />
      <Route path="/login" element={<Login />} />
      <Route path="/register" element={<Register />} />
      <Route path="/forgot-password" element={<ForgotPassword />} />
      <Route path="/reset-password" element={<ResetPassword />} />

      {/* Role-based entry: logged-in users go to their dashboard, everyone else sees the landing page */}
      <Route path="/" element={
        <ProtectedRoute unauthenticatedElement={<Landing />} />
      }>
        <Route index element={<RoleHome />} />
      </Route>

      {/* Customer area */}
      <Route element={
        <ProtectedRoute unauthenticatedElement={<Navigate to="/login" replace />} />}>
        <Route element={
          <RoleGuard allow={["customer"]}>
            <AppLayout />
          </RoleGuard>
        }>
          <Route path="/customer" element={<CustomerDashboard />} />
          <Route path="/customer/new" element={<CreateRequest />} />
          <Route path="/customer/request/:id" element={<RequestDetail />} />
          <Route path="/customer/history" element={<CustomerHistory />} />
          <Route path="/customer/notifications" element={<Notifications />} />
          <Route path="/customer/profile" element={<Profile role="customer" />} />
        </Route>
      </Route>

      {/* Driver area */}
      <Route element={
        <ProtectedRoute unauthenticatedElement={<Navigate to="/login" replace />} />}>
        <Route element={
          <RoleGuard allow={["driver"]}>
            <AppLayout />
          </RoleGuard>
        }>
          <Route path="/driver" element={<DriverDashboard />} />
          <Route path="/driver/onboarding" element={<DriverOnboarding />} />
          <Route path="/driver/job/:id" element={<DriverJobDetail />} />
          <Route path="/driver/history" element={<DriverHistory />} />
          <Route path="/driver/notifications" element={<Notifications />} />
          <Route path="/driver/profile" element={<Profile role="driver" />} />
          <Route path="/vehicle-management" element={<VehicleManagement />} />
        </Route>
      </Route>

      {/* Shared (customer + driver) area */}
      <Route element={
        <ProtectedRoute unauthenticatedElement={<Navigate to="/login" replace />} />}>
        <Route element={
          <RoleGuard allow={["customer", "driver"]}>
            <AppLayout />
          </RoleGuard>
        }>
          <Route path="/payment-history" element={<PaymentHistory />} />
          <Route path="/support" element={<Support />} />
          <Route path="/alerts" element={<AlertSettings />} />
          <Route path="/messages" element={<Messages />} />
          <Route path="/wallet" element={<Wallet />} />
          <Route path="/return-loads" element={<ReturnMarketplace />} />
          <Route path="/return-loads/:id/book" element={<BookReturnLoad />} />
          <Route path="/return-loads/manage" element={<DriverReturnLoads />} />
        </Route>
      </Route>

      {/* Business / Fleet management area — gated off for the testing period */}
      <Route element={
        <ProtectedRoute unauthenticatedElement={<Navigate to="/login" replace />} />}>
        <Route path="/business/onboarding" element={<ComingSoon title="Business accounts coming soon" subtitle="Fleet management for businesses isn't available yet during testing." />} />
        <Route path="/business" element={<ComingSoon title="Business accounts coming soon" subtitle="Fleet management for businesses isn't available yet during testing." />} />
      </Route>

      {/* Chat (full-screen, no app shell) */}
      <Route element={
        <ProtectedRoute unauthenticatedElement={<Navigate to="/login" replace />} />}>
        <Route path="/chat/:id" element={<RoleGuard allow={["customer", "driver", "admin"]}><Chat /></RoleGuard>} />
      </Route>

      {/* Admin area */}
      <Route element={
        <ProtectedRoute unauthenticatedElement={<Navigate to="/login" replace />} />}>
        <Route element={
          <RoleGuard allow={["admin"]}>
            <AdminLayout />
          </RoleGuard>
        }>
          <Route path="/admin" element={<AdminDashboard />} />
          <Route path="/admin/verification" element={<AdminVerification />} />
          <Route path="/admin/verification/:userId/onboard" element={<AdminAssistedOnboarding />} />
          <Route path="/admin/users" element={<AdminUsers />} />
          <Route path="/admin/jobs" element={<AdminJobs />} />
          <Route path="/admin/analytics" element={<AdminAnalytics />} />
          <Route path="/admin/reports" element={<AdminReports />} />
          <Route path="/admin/finance" element={<AdminFinance />} />
          <Route path="/admin/content" element={<AdminContent />} />
          <Route path="/admin/messages" element={<Messages />} />
        </Route>
      </Route>

      <Route path="*" element={<PageNotFound />} />
    </Routes>
    </>
  );
};


function App() {

  return (
    <AuthProvider>
      <ThemeLoader />
      <QueryClientProvider client={queryClientInstance}>
        <Router>
          <ScrollToTop />
          <NativeAppBridge />
          <AuthenticatedApp />
        </Router>
        <Toaster />
      </QueryClientProvider>
    </AuthProvider>
  )
}

export default App
