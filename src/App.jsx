import { Toaster } from "@/components/ui/toaster"
import { QueryClientProvider } from '@tanstack/react-query'
import { queryClientInstance } from '@/lib/query-client'
import { pagesConfig } from './pages.config'
import { BrowserRouter as Router, Route, Routes, Navigate } from 'react-router-dom';
import PageNotFound from './lib/PageNotFound';
import { AuthProvider, useAuth } from '@/lib/AuthContext';
import { ImpersonationProvider } from '@/lib/ImpersonationContext';
import ImpersonationBanner from '@/components/portal/ImpersonationBanner';

import BiometricGate from '@/components/auth/BiometricGate';
import ProtectedRoute from '@/components/ProtectedRoute';
import RequireAdmin from '@/components/RequireAdmin';
import RequirePortalAccess from '@/components/RequirePortalAccess';
import RequirePortalRole from '@/components/RequirePortalRole';
import ApplyChooser from './pages/apply/ApplyChooser';
import PropertyManagerApply from './pages/apply/PropertyManagerApply';
import HomeownerApply from './pages/apply/HomeownerApply';
import ExistingPartnerApply from './pages/apply/ExistingPartnerApply';
import Join from './pages/join/Join';
import PortalDashboard from './pages/portal/PortalDashboard';
import MyProperties from './pages/portal/MyProperties';
import AddProperty from './pages/portal/AddProperty';
import PortalBilling from './pages/portal/PortalBilling';
import PortalNotifications from './pages/portal/PortalNotifications';
import Team from './pages/portal/Team';
import AcceptInvite from './pages/portal/AcceptInvite';
import PropertyDetail from './pages/portal/PropertyDetail';
import AdminQueue from './pages/portal/admin/AdminQueue';
import AdminReview from './pages/portal/admin/AdminReview';
import AdminPartners from './pages/portal/admin/AdminPartners';
import AdminBilling from './pages/portal/admin/AdminBilling';
import AdminAudit from './pages/portal/admin/AdminAudit';
import AdminApplications from './pages/portal/admin/AdminApplications';
import AdminHub from './pages/portal/admin/AdminHub';
import AdminDestinations from './components/portal/admin/AdminDestinations';
import AdminEmailPreviews from './pages/portal/admin/AdminEmailPreviews';
import AdminApplyMedia from './pages/portal/admin/AdminApplyMedia';
import AdminApplyFunnel from './pages/portal/admin/AdminApplyFunnel';
import AdminReviews from './pages/portal/admin/AdminReviews';
import PartnerProfile from './pages/portal/PartnerProfile';
import Licenses from './pages/Licenses';
import GitHub from './pages/GitHub';
import LandingPage from './pages/LandingPage';
import Careers from './pages/portal/Careers';
import TechStack from './pages/portal/TechStack';
import PublicCareers from './pages/PublicCareers';
import JobApplications from './pages/JobApplications';
import PendingApproval from './pages/portal/PendingApproval';
import OnboardingGuide from './pages/portal/OnboardingGuide';
import Resources from './pages/portal/Resources';
import PrivacyPolicy from './pages/PrivacyPolicy';
import Login from '@/pages/Login';
import Register from '@/pages/Register';
import ForgotPassword from '@/pages/ForgotPassword';
import ResetPassword from '@/pages/ResetPassword';
import useAttributionCapture from '@/hooks/useAttributionCapture';
import ScrollToTop from '@/components/ScrollToTop';


const { Pages, Layout, mainPage } = pagesConfig;
const mainPageKey = mainPage ?? Object.keys(Pages)[0];
const MainPage = mainPageKey ? Pages[mainPageKey] : <></>;

const LayoutWrapper = ({ children, currentPageName }) => Layout ?
  <Layout currentPageName={currentPageName}>{children}</Layout>
  : <>{children}</>;

const AuthenticatedApp = () => {
  const { user, isLoadingAuth, isLoadingPublicSettings } = useAuth();

  // Never render user-dependent content while auth is still resolving.
  // user === undefined = haven't checked yet; null = checked, not authenticated; object = authenticated.
  if (isLoadingPublicSettings || isLoadingAuth || user === undefined) {
    return (
      <div className="fixed inset-0 flex items-center justify-center bg-[#0D1B2A]">
        <div className="w-8 h-8 border-4 border-slate-700 border-t-[#C9A96E] rounded-full animate-spin"></div>
      </div>
    );
  }

  return (
    <BiometricGate>
      <Routes>
        {/* Custom auth pages — public */}
        <Route path="/login" element={<Login />} />
        <Route path="/register" element={<Register />} />
        <Route path="/signup" element={<Register />} />
        <Route path="/forgot-password" element={<ForgotPassword />} />
        <Route path="/reset-password" element={<ResetPassword />} />

        {/* Public landing / marketing / apply pages — no auth required (Google OAuth consent requires public homepage) */}
        <Route path="/" element={
          !user
            ? <LandingPage />
            : user.role === 'admin' || user.role === 'super_admin'
              ? <Navigate to="/admin/hub" replace />
              : <Navigate to="/portal/dashboard" replace />
        } />
        <Route path="/apply" element={<ApplyChooser />} />
        <Route path="/apply/property-manager" element={<PropertyManagerApply />} />
        <Route path="/apply/homeowner" element={<HomeownerApply />} />
        <Route path="/apply/existing-partner" element={<ExistingPartnerApply />} />
        <Route path="/join" element={<Join />} />
        <Route path="/careers" element={<PublicCareers />} />
        <Route path="/privacy" element={<PrivacyPolicy />} />
        <Route path="/portal/accept-invite" element={<AcceptInvite />} />

        {/* Protected app — gated by ProtectedRoute; unauthenticated visitors are redirected to /login */}
        <Route element={<ProtectedRoute unauthenticatedElement={<Navigate to="/login" replace />} />}>
          {Object.entries(Pages).map(([path, Page]) => (
            <Route
              key={path}
              path={`/${path}`}
              element={
                <RequireAdmin>
                  <LayoutWrapper currentPageName={path}><Page /></LayoutWrapper>
                </RequireAdmin>
              }
            />
          ))}
          {/* Admin routes with main layout — wrapped in RequireAdmin */}
          <Route path="/admin/hub" element={<RequireAdmin><LayoutWrapper currentPageName="AdminHub"><AdminHub /></LayoutWrapper></RequireAdmin>} />
          <Route path="/admin/destinations" element={<RequireAdmin><LayoutWrapper currentPageName="Destinations"><AdminDestinations /></LayoutWrapper></RequireAdmin>} />
          <Route path="/admin/queue" element={<RequireAdmin><LayoutWrapper currentPageName="AdminQueue"><AdminQueue /></LayoutWrapper></RequireAdmin>} />
          <Route path="/admin/review/:id" element={<RequireAdmin><LayoutWrapper currentPageName="AdminReview"><AdminReview /></LayoutWrapper></RequireAdmin>} />
          <Route path="/admin/partners" element={<RequireAdmin><LayoutWrapper currentPageName="AdminPartners"><AdminPartners /></LayoutWrapper></RequireAdmin>} />
          <Route path="/admin/billing" element={<RequireAdmin><LayoutWrapper currentPageName="AdminBilling"><AdminBilling /></LayoutWrapper></RequireAdmin>} />
          <Route path="/admin/audit" element={<RequireAdmin><LayoutWrapper currentPageName="AdminAudit"><AdminAudit /></LayoutWrapper></RequireAdmin>} />
          <Route path="/admin/applications" element={<RequireAdmin><LayoutWrapper currentPageName="AdminApplications"><AdminApplications /></LayoutWrapper></RequireAdmin>} />
          <Route path="/admin/email-previews" element={<RequireAdmin><LayoutWrapper currentPageName="AdminEmailPreviews"><AdminEmailPreviews /></LayoutWrapper></RequireAdmin>} />
          <Route path="/admin/email-previews/:variationSlug" element={<RequireAdmin><LayoutWrapper currentPageName="AdminEmailPreviews"><AdminEmailPreviews /></LayoutWrapper></RequireAdmin>} />
          <Route path="/admin/apply-media" element={<RequireAdmin><LayoutWrapper currentPageName="AdminHub"><AdminApplyMedia /></LayoutWrapper></RequireAdmin>} />
          <Route path="/admin/apply-funnel" element={<RequireAdmin><LayoutWrapper currentPageName="AdminApplyFunnel"><AdminApplyFunnel /></LayoutWrapper></RequireAdmin>} />
          <Route path="/admin/reviews" element={<RequireAdmin><LayoutWrapper currentPageName="AdminReviews"><AdminReviews /></LayoutWrapper></RequireAdmin>} />
          <Route path="/JobApplications" element={<RequireAdmin><LayoutWrapper currentPageName="JobApplications"><JobApplications /></LayoutWrapper></RequireAdmin>} />
          {/* Partner Portal */}
          <Route path="/portal/pending" element={<PendingApproval />} />
          <Route path="/portal/onboarding-guide" element={<RequirePortalAccess><OnboardingGuide /></RequirePortalAccess>} />
          <Route path="/portal/dashboard" element={<RequirePortalAccess><PortalDashboard /></RequirePortalAccess>} />
          <Route path="/portal/properties" element={<RequirePortalRole allowedRoles={["owner", "marketing", "operations"]}><MyProperties /></RequirePortalRole>} />
          <Route path="/portal/properties/:id" element={<RequirePortalRole allowedRoles={["owner", "marketing", "operations"]}><PropertyDetail /></RequirePortalRole>} />
          <Route path="/portal/add-property" element={<RequirePortalRole allowedRoles={["owner", "marketing", "operations"]}><AddProperty /></RequirePortalRole>} />
          <Route path="/portal/billing" element={<RequirePortalRole allowedRoles={["owner", "finance"]}><PortalBilling /></RequirePortalRole>} />
          <Route path="/portal/notifications" element={<RequirePortalAccess><PortalNotifications /></RequirePortalAccess>} />
          <Route path="/portal/team" element={<RequirePortalAccess><Team /></RequirePortalAccess>} />
          <Route path="/portal/profile" element={<RequirePortalAccess><PartnerProfile /></RequirePortalAccess>} />
          <Route path="/portal/resources" element={<RequirePortalAccess><Resources /></RequirePortalAccess>} />
          <Route path="/portal/careers" element={<RequirePortalRole allowedRoles={["owner", "marketing", "operations"]}><Careers /></RequirePortalRole>} />
          <Route path="/portal/tech-stack" element={<RequirePortalRole allowedRoles={["owner", "operations"]}><TechStack /></RequirePortalRole>} />
          <Route path="/portal/job-applications" element={<RequirePortalAccess><Navigate to="/portal/careers?tab=applications" replace /></RequirePortalAccess>} />
          <Route path="/Licenses" element={<RequireAdmin><LayoutWrapper currentPageName="Licenses"><Licenses /></LayoutWrapper></RequireAdmin>} />
          <Route path="/GitHub" element={<RequireAdmin><LayoutWrapper currentPageName="GitHub"><GitHub /></LayoutWrapper></RequireAdmin>} />
        </Route>

        {/* Legacy redirects */}
        <Route path="/Onboarding" element={<Navigate to="/PartnerFunnelTracker" replace />} />
        <Route path="/Homeowners" element={<Navigate to="/Partners?type=owner" replace />} />
        <Route path="/FunnelTracker" element={<Navigate to="/PartnerFunnelTracker" replace />} />
        <Route path="/AdminHub" element={<Navigate to="/admin/hub" replace />} />
        <Route path="/AdminControlCenter" element={<Navigate to="/admin/hub" replace />} />

        <Route path="*" element={<PageNotFound />} />
      </Routes>
    </BiometricGate>
  );
};


function App() {
  useAttributionCapture();

  return (
    <AuthProvider>
      <QueryClientProvider client={queryClientInstance}>
        <Router>
          <ScrollToTop />
          <ImpersonationProvider>
            <ImpersonationBanner />
            <AuthenticatedApp />
          </ImpersonationProvider>
          <Toaster />
        </Router>
      </QueryClientProvider>
    </AuthProvider>
  )
}

export default App