import { lazy, Suspense } from "react";
import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { AuthProvider } from "@/lib/auth";
import { ProtectedRoute } from "@/components/ProtectedRoute";
import { SubscriptionLayout } from "@/components/SubscriptionLayout";
import { ThemeProvider } from "next-themes";
import { RealtimeNotificationsProvider } from "@/components/RealtimeNotificationsProvider";
import { PageLoadingFallback } from "@/components/ui/page-loading";
import { ErrorBoundary } from "@/components/ErrorBoundary";
import { PWAInstallBanner } from "@/components/PWAInstallBanner";
import { CommandPalette } from "@/components/CommandPalette";
import { KeyboardShortcuts } from "@/components/KeyboardShortcuts";

// Lazy load pages
const LandingPage = lazy(() => import("./pages/Landing"));
const AuthPage = lazy(() => import("./pages/Auth"));
const DashboardPage = lazy(() => import("./pages/Dashboard"));
const ProspectingPage = lazy(() => import("./pages/Prospecting"));
const MissionsPage = lazy(() => import("./pages/Missions"));
const MissionDetailPage = lazy(() => import("./pages/MissionDetail"));
const CampaignsPage = lazy(() => import("./pages/Campaigns"));

const MassSendPage = lazy(() => import("./pages/MassSend"));
const EmailFinderPage = lazy(() => import("./pages/EmailFinder"));
const ProspectingHistoryPage = lazy(() => import("./pages/ProspectingHistory"));
const ABTestingPage = lazy(() => import("./pages/ABTesting"));
const MeetingsPage = lazy(() => import("./pages/Meetings"));
const FollowUpPage = lazy(() => import("./pages/FollowUp"));
const TemplatesPage = lazy(() => import("./pages/Templates"));
const AnalyticsPage = lazy(() => import("./pages/Analytics"));
const AntiBanPage = lazy(() => import("./pages/AntiBan"));
const SettingsLayout = lazy(() => import("./components/settings/SettingsLayout"));
const SettingsConnections = lazy(() => import("./pages/settings/SettingsConnections"));
const SettingsApiKeys = lazy(() => import("./pages/settings/SettingsApiKeys"));
const SettingsAntiBlock = lazy(() => import("./pages/settings/SettingsAntiBlock"));
const SettingsAgent = lazy(() => import("./pages/settings/SettingsAgent"));
const SettingsTeam = lazy(() => import("./pages/settings/SettingsTeam"));
const SettingsNotifications = lazy(() => import("./pages/settings/SettingsNotifications"));
const SettingsReports = lazy(() => import("./pages/settings/SettingsReports"));
const SettingsMeetings = lazy(() => import("./pages/settings/SettingsMeetings"));
const SettingsWebhook = lazy(() => import("./pages/settings/SettingsWebhook"));
const TutorialPage = lazy(() => import("./pages/Tutorial"));
const DiagnosticsPage = lazy(() => import("./pages/Diagnostics"));
const NotFound = lazy(() => import("./pages/NotFound"));
const CNPJRadarPage = lazy(() => import("./pages/CNPJRadar"));
const OpportunityRadarPage = lazy(() => import("./pages/OpportunityRadar"));
const SDRAgentPage = lazy(() => import("./pages/SDRAgent"));
const BillingPage = lazy(() => import("./pages/Billing"));
const APIReferencePage = lazy(() => import("./pages/APIReference"));
const SocialExtractorPage = lazy(() => import("./pages/SocialExtractor"));
const ColdReactivationPage = lazy(() => import("./pages/ColdReactivation"));
const CRMLayout = lazy(() => import("./components/crm/CRMLayout"));
const CRMPipelinePage = lazy(() => import("./pages/crm/CRMPipeline"));
const CRMContactsPage = lazy(() => import("./pages/crm/CRMContacts"));
const CRMContactDetailPage = lazy(() => import("./pages/crm/CRMContactDetail"));
const CRMActivitiesPage = lazy(() => import("./pages/crm/CRMActivities"));
const CRMAnalyticsPage = lazy(() => import("./pages/crm/CRMAnalytics"));
const CRMMetaAdsPage = lazy(() => import("./pages/crm/CRMMetaAds"));
const CRMInboxPage = lazy(() => import("./pages/crm/CRMInbox"));
const CRMAutomationsPage = lazy(() => import("./pages/crm/CRMAutomations"));
const AdminPage = lazy(() => import("./pages/Admin"));
const SupportPage = lazy(() => import("./pages/Support"));
const ObjectionsPage = lazy(() => import("./pages/Objections"));

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 1000 * 60 * 2,
      gcTime: 1000 * 60 * 5,
      refetchOnWindowFocus: false,
      retry: 1,
    },
  },
});

const App = () => (
  <ErrorBoundary>
    <QueryClientProvider client={queryClient}>
      <ThemeProvider attribute="class" defaultTheme="system" enableSystem>
        <AuthProvider>
          <RealtimeNotificationsProvider>
            <TooltipProvider>
              <Toaster />
              <Sonner />
              <BrowserRouter>
                <SubscriptionLayout>
                <Suspense fallback={<PageLoadingFallback />}>
                <Routes>
                  <Route path="/" element={<LandingPage />} />
                  <Route path="/auth" element={<AuthPage />} />

                  <Route path="/dashboard" element={<ProtectedRoute><DashboardPage /></ProtectedRoute>} />
                  <Route path="/tutorial" element={<ProtectedRoute><TutorialPage /></ProtectedRoute>} />
                  
                  {/* Prospecção */}
                  <Route path="/prospecting" element={<ProtectedRoute><ProspectingPage /></ProtectedRoute>} />

                  {/* Esteira comercial: missão -> pesquisa -> qualificação -> oferta -> abordagem */}
                  <Route path="/missions" element={<ProtectedRoute><MissionsPage /></ProtectedRoute>} />
                  <Route path="/missions/:id" element={<ProtectedRoute><MissionDetailPage /></ProtectedRoute>} />
                  
                  <Route path="/mass-send" element={<ProtectedRoute><MassSendPage /></ProtectedRoute>} />
                  
                  <Route path="/email-finder" element={<ProtectedRoute><EmailFinderPage /></ProtectedRoute>} />
                  <Route path="/prospecting-history" element={<ProtectedRoute><ProspectingHistoryPage /></ProtectedRoute>} />
                  <Route path="/campaigns" element={<ProtectedRoute><CampaignsPage /></ProtectedRoute>} />
                  <Route path="/ab-testing" element={<ProtectedRoute><ABTestingPage /></ProtectedRoute>} />

                  {/* Redirects de rotas duplicadas → CRM */}
                  <Route path="/leads" element={<Navigate to="/crm/contacts" replace />} />
                  <Route path="/funnel" element={<Navigate to="/crm/pipeline" replace />} />
                  <Route path="/conversations" element={<Navigate to="/crm/inbox" replace />} />
                  <Route path="/automations" element={<Navigate to="/crm/automations" replace />} />
                  {/* Redirects de rotas duplicadas → Prospecting tabs */}
                  <Route path="/google-maps" element={<Navigate to="/prospecting?tab=maps" replace />} />
                  <Route path="/web-search" element={<Navigate to="/prospecting?tab=web-search" replace />} />
                  <Route path="/whatsapp-groups" element={<Navigate to="/prospecting?tab=whatsapp-groups" replace />} />
                  <Route path="/import-leads" element={<Navigate to="/prospecting?tab=import" replace />} />

                  {/* Engajamento */}
                  <Route path="/meetings" element={<ProtectedRoute><MeetingsPage /></ProtectedRoute>} />
                  <Route path="/scheduled-prospecting" element={<Navigate to="/meetings" replace />} />
                  <Route path="/follow-up" element={<ProtectedRoute><FollowUpPage /></ProtectedRoute>} />
                  <Route path="/cold-reactivation" element={<ProtectedRoute><ColdReactivationPage /></ProtectedRoute>} />
                  <Route path="/templates" element={<ProtectedRoute><TemplatesPage /></ProtectedRoute>} />
                  <Route path="/objections" element={<ProtectedRoute><ObjectionsPage /></ProtectedRoute>} />

                  {/* Ferramentas */}
                  <Route path="/analytics" element={<ProtectedRoute><AnalyticsPage /></ProtectedRoute>} />
                  <Route path="/antiban" element={<ProtectedRoute><AntiBanPage /></ProtectedRoute>} />
                  {/* Settings Module */}
                  <Route path="/settings" element={<ProtectedRoute><SettingsLayout /></ProtectedRoute>}>
                    <Route index element={<Navigate to="/settings/connections" replace />} />
                    <Route path="connections" element={<SettingsConnections />} />
                    <Route path="api-keys" element={<SettingsApiKeys />} />
                    <Route path="anti-block" element={<SettingsAntiBlock />} />
                    <Route path="agent" element={<SettingsAgent />} />
                    <Route path="team" element={<SettingsTeam />} />
                    <Route path="notifications" element={<SettingsNotifications />} />
                    <Route path="reports" element={<SettingsReports />} />
                    <Route path="meetings" element={<SettingsMeetings />} />
                    <Route path="webhook" element={<SettingsWebhook />} />
                  </Route>
                  {/* Era /tests, sem link em lugar nenhum e com cara de
                      ferramenta de desenvolvedor. É justamente a tela que
                      responde "meu WhatsApp está funcionando?" — agora tem
                      nome de gente e link no Suporte. */}
                  <Route path="/diagnostico" element={<ProtectedRoute><DiagnosticsPage /></ProtectedRoute>} />
                  <Route path="/tests" element={<Navigate to="/diagnostico" replace />} />
                  <Route path="/cnpj-radar" element={<ProtectedRoute><CNPJRadarPage /></ProtectedRoute>} />
                  <Route path="/oportunidades" element={<ProtectedRoute><OpportunityRadarPage /></ProtectedRoute>} />
                  <Route path="/instagram-extractor" element={<Navigate to="/social-extractor" replace />} />
                  <Route path="/sdr-agent" element={<ProtectedRoute><SDRAgentPage /></ProtectedRoute>} />
                  <Route path="/billing" element={<ProtectedRoute><BillingPage /></ProtectedRoute>} />
                  <Route path="/api-reference" element={<ProtectedRoute><APIReferencePage /></ProtectedRoute>} />
                  <Route path="/social-extractor" element={<ProtectedRoute><SocialExtractorPage /></ProtectedRoute>} />
                  <Route path="/facebook-extractor" element={<Navigate to="/social-extractor" replace />} />
                  <Route path="/admin" element={<ProtectedRoute><AdminPage /></ProtectedRoute>} />
                  <Route path="/support" element={<ProtectedRoute><SupportPage /></ProtectedRoute>} />

                  {/* CRM Module */}
                  <Route path="/crm" element={<ProtectedRoute><CRMLayout /></ProtectedRoute>}>
                    <Route index element={<Navigate to="/crm/pipeline" replace />} />
                    <Route path="pipeline" element={<CRMPipelinePage />} />
                    <Route path="contacts" element={<CRMContactsPage />} />
                    <Route path="contacts/:id" element={<CRMContactDetailPage />} />
                    <Route path="inbox" element={<CRMInboxPage />} />
                    <Route path="activities" element={<CRMActivitiesPage />} />
                    <Route path="analytics" element={<CRMAnalyticsPage />} />
                    <Route path="automations" element={<CRMAutomationsPage />} />
                    <Route path="meta-ads" element={<CRMMetaAdsPage />} />
                  </Route>

                  <Route path="*" element={<NotFound />} />
                </Routes>
              </Suspense>
              </SubscriptionLayout>
              <CommandPalette />
              <KeyboardShortcuts />
            </BrowserRouter>
            <PWAInstallBanner />
          </TooltipProvider>
        </RealtimeNotificationsProvider>
      </AuthProvider>
    </ThemeProvider>
  </QueryClientProvider>
  </ErrorBoundary>
);

export default App;
