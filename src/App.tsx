import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import { ThemeProvider } from "@/components/ThemeProvider";
import Index from "./pages/Index";
import Login from "./pages/Login";
import Signup from "./pages/Signup";
import NotFound from "./pages/NotFound";
import DashboardLayout from "./components/dashboard/DashboardLayout";
import DashboardHome from "./pages/dashboard/DashboardHome";
import ColaboradoresPage from "./pages/dashboard/ColaboradoresPage";
import EmpresasPage from "./pages/dashboard/EmpresasPage";
import SetoresPage from "./pages/dashboard/SetoresPage";
import CargosPage from "./pages/dashboard/CargosPage";
import FeriasPage from "./pages/dashboard/FeriasPage";
import FinanceiroPage from "./pages/dashboard/FinanceiroPage";
import RelatoriosPage from "./pages/dashboard/RelatoriosPage";
import BeneficiosPage from "./pages/dashboard/BeneficiosPage";
import ConfiguracoesPage from "./pages/dashboard/ConfiguracoesPage";
import ContabilidadePage from "./pages/dashboard/ContabilidadePage";

// Portal do Colaborador
import { PortalProvider } from "./contexts/PortalContext";
import PortalLayout from "./components/portal/PortalLayout";
import PortalGuard from "./components/portal/PortalGuard";
import PortalLogin from "./pages/colaborador/PortalLogin";
import PortalHome from "./pages/colaborador/PortalHome";
import MeuExtratoPage from "./pages/colaborador/MeuExtratoPage";
import MeusBeneficiosPage from "./pages/colaborador/MeusBeneficiosPage";
import MeusContracheques from "./pages/colaborador/MeusContracheques";

import { MasterProvider } from "./contexts/MasterContext";
import { MasterGuard } from "./components/master/MasterGuard";
import { MasterLayout } from "./components/master/MasterLayout";
import MasterDashboard from "./pages/master/MasterDashboard";
import MasterEmpresasPage from "./pages/master/MasterEmpresasPage";
import MasterCompanyDetailsPage from "./pages/master/MasterCompanyDetailsPage";
import MasterMensagensPage from "./pages/master/MasterMensagensPage";
import MasterConfiguracoesPage from "./pages/master/MasterConfiguracoesPage";
import MasterLoginPage from "./pages/master/MasterLoginPage";

const queryClient = new QueryClient();

const App = () => (
  <QueryClientProvider client={queryClient}>
    <ThemeProvider>
      <TooltipProvider>
        <Toaster />
        <Sonner />
        <BrowserRouter>
        <Routes>
          <Route path="/" element={<Index />} />
          <Route path="/login" element={<Login />} />
          <Route path="/signup" element={<Signup />} />
          
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
          </Route>

          {/* Portal do Colaborador - Login */}
          <Route path="/portal/login" element={<PortalLogin />} />
          
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

          {/* Portal Master - Administração RH360 */}
          <Route path="/master/login" element={<MasterLoginPage />} />
          <Route
            path="/master"
            element={
              <MasterProvider>
                <MasterGuard>
                  <MasterLayout>
                    <MasterDashboard />
                  </MasterLayout>
                </MasterGuard>
              </MasterProvider>
            }
          />
          <Route
            path="/master/empresas"
            element={
              <MasterProvider>
                <MasterGuard>
                  <MasterLayout>
                    <MasterEmpresasPage />
                  </MasterLayout>
                </MasterGuard>
              </MasterProvider>
            }
          />
          <Route
            path="/master/empresas/:id"
            element={
              <MasterProvider>
                <MasterGuard>
                  <MasterLayout>
                    <MasterCompanyDetailsPage />
                  </MasterLayout>
                </MasterGuard>
              </MasterProvider>
            }
          />
          <Route
            path="/master/mensagens"
            element={
              <MasterProvider>
                <MasterGuard>
                  <MasterLayout>
                    <MasterMensagensPage />
                  </MasterLayout>
                </MasterGuard>
              </MasterProvider>
            }
          />
          <Route
            path="/master/configuracoes"
            element={
              <MasterProvider>
                <MasterGuard>
                  <MasterConfiguracoesPage />
                </MasterGuard>
              </MasterProvider>
            }
          />
          
          <Route path="*" element={<NotFound />} />
        </Routes>
      </BrowserRouter>
    </TooltipProvider>
  </ThemeProvider>
</QueryClientProvider>
);

export default App;