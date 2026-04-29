import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { ThemeProvider } from "@/components/ThemeProvider";
import { useDynamicFavicon } from "@/hooks/useDynamicFavicon";
import Login from "./pages/Login";

import NotFound from "./pages/NotFound";
import DashboardLayout from "./components/dashboard/DashboardLayout";
import DashboardHome from "./pages/dashboard/DashboardHome";
import ColaboradoresPage from "./modules/core/pages/ColaboradoresPage";
import EmpresasPage from "./modules/core/pages/EmpresasPage";
import SetoresPage from "./modules/core/pages/SetoresPage";
import CargosPage from "./modules/core/pages/CargosPage";
import FeriasPage from "./pages/dashboard/FeriasPage";
import FinanceiroPage from "./modules/payroll/pages/FinanceiroPage";
import RelatoriosPage from "./pages/dashboard/RelatoriosPage";
import BeneficiosPage from "./pages/dashboard/BeneficiosPage";
import ConfiguracoesPage from "./pages/dashboard/ConfiguracoesPage";
import ContabilidadePage from "./pages/dashboard/ContabilidadePage";
import ExamesPage from "./pages/dashboard/ExamesPage";

// Modules (novo layout per CLAUDE.md)
import JornadaPage from "./modules/journey/pages/JornadaPage";
import BadgesPage from "./modules/journey/pages/BadgesPage";
import AdmissoesPage from "./modules/admission/pages/AdmissoesPage";
import AdmissionDetailPage from "./modules/admission/pages/AdmissionDetailPage";
import VagasPage from "./modules/recruitment/pages/VagasPage";
import VagaDetailPage from "./modules/recruitment/pages/VagaDetailPage";
import CandidatosPage from "./modules/recruitment/pages/CandidatosPage";
import PeriodosPage from "./modules/payroll/pages/PeriodosPage";
import PeriodDetailPage from "./modules/payroll/pages/PeriodDetailPage";
import RecrutadorPage from "./modules/agents/pages/RecrutadorPage";

// Portal do Colaborador
import { PortalProvider } from "./contexts/PortalContext";
import PortalLayout from "./components/portal/PortalLayout";
import PortalGuard from "./components/portal/PortalGuard";
import PortalLogin from "./pages/colaborador/PortalLogin";
import PrimeiroAcesso from "./pages/colaborador/PrimeiroAcesso";
import PortalHome from "./pages/colaborador/PortalHome";
import MeuExtratoPage from "./pages/colaborador/MeuExtratoPage";
import MeusBeneficiosPage from "./pages/colaborador/MeusBeneficiosPage";
import MeusContracheques from "./pages/colaborador/MeusContracheques";
import MinhasFeriasPage from "./pages/colaborador/MinhasFeriasPage";
import MeusExamesPage from "./pages/colaborador/MeusExamesPage";

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      refetchOnWindowFocus: false,
      staleTime: 1000 * 60 * 5, // 5 minutes
    },
  },
});

const App = () => {
  useDynamicFavicon();
  
  return (
  <QueryClientProvider client={queryClient}>
    <ThemeProvider>
      <TooltipProvider>
        <Toaster />
        <Sonner />
        <BrowserRouter>
        <Routes>
          <Route path="/" element={<Navigate to="/login" replace />} />
          <Route path="/login" element={<Login />} />

          {/* Dashboard routes with persistent layout */}
          <Route path="/dashboard" element={<DashboardLayout />}>
            <Route index element={<DashboardHome />} />
            <Route path="colaboradores" element={<ColaboradoresPage />} />
            <Route path="setores" element={<SetoresPage />} />
            <Route path="empresas" element={<EmpresasPage />} />
            <Route path="cargos" element={<CargosPage />} />
            <Route path="ferias" element={<FeriasPage />} />
            <Route path="financeiro" element={<FinanceiroPage />} />
            <Route path="beneficios" element={<BeneficiosPage />} />
            <Route path="relatorios" element={<RelatoriosPage />} />
            <Route path="configuracoes" element={<ConfiguracoesPage />} />
            <Route path="contabilidade" element={<ContabilidadePage />} />
            <Route path="exames" element={<ExamesPage />} />
            <Route path="jornada" element={<JornadaPage />} />
            <Route path="jornada/badges" element={<BadgesPage />} />
            <Route path="admissoes" element={<AdmissoesPage />} />
            <Route path="admissoes/:id" element={<AdmissionDetailPage />} />
            <Route path="vagas" element={<VagasPage />} />
            <Route path="vagas/:id" element={<VagaDetailPage />} />
            <Route path="candidatos" element={<CandidatosPage />} />
            <Route path="folha" element={<PeriodosPage />} />
            <Route path="folha/:id" element={<PeriodDetailPage />} />
            <Route path="recrutador" element={<RecrutadorPage />} />
          </Route>

          {/* Portal do Colaborador - Login */}
          <Route path="/portal/login" element={<PortalLogin />} />
          <Route path="/portal/primeiro-acesso" element={<PrimeiroAcesso />} />
          
          {/* Portal do Colaborador - Layout isolado */}
          <Route
            path="/colaborador"
            element={
              <PortalProvider>
                <PortalGuard>
                  <PortalLayout>
                    <PortalHome />
                  </PortalLayout>
                </PortalGuard>
              </PortalProvider>
            }
          />
          <Route
            path="/colaborador/extrato"
            element={
              <PortalProvider>
                <PortalGuard>
                  <PortalLayout>
                    <MeuExtratoPage />
                  </PortalLayout>
                </PortalGuard>
              </PortalProvider>
            }
          />
          <Route
            path="/colaborador/beneficios"
            element={
              <PortalProvider>
                <PortalGuard>
                  <PortalLayout>
                    <MeusBeneficiosPage />
                  </PortalLayout>
                </PortalGuard>
              </PortalProvider>
            }
          />
          <Route
            path="/colaborador/contracheques"
            element={
              <PortalProvider>
                <PortalGuard>
                  <PortalLayout>
                    <MeusContracheques />
                  </PortalLayout>
                </PortalGuard>
              </PortalProvider>
            }
          />
          <Route
            path="/colaborador/ferias"
            element={
              <PortalProvider>
                <PortalGuard>
                  <PortalLayout>
                    <MinhasFeriasPage />
                  </PortalLayout>
                </PortalGuard>
              </PortalProvider>
            }
          />
          <Route
            path="/colaborador/exames"
            element={
              <PortalProvider>
                <PortalGuard>
                  <PortalLayout>
                    <MeusExamesPage />
                  </PortalLayout>
                </PortalGuard>
              </PortalProvider>
            }
          />

          <Route path="*" element={<NotFound />} />
        </Routes>
      </BrowserRouter>
    </TooltipProvider>
  </ThemeProvider>
</QueryClientProvider>
  );
};

export default App;