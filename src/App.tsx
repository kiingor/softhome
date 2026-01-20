import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import Index from "./pages/Index";
import Login from "./pages/Login";
import Signup from "./pages/Signup";
import NotFound from "./pages/NotFound";
import DashboardLayout from "./components/dashboard/DashboardLayout";
import DashboardHome from "./pages/dashboard/DashboardHome";
import ColaboradoresPage from "./pages/dashboard/ColaboradoresPage";
import LojasPage from "./pages/dashboard/LojasPage";
import FeriasPage from "./pages/dashboard/FeriasPage";
import LancamentosPage from "./pages/dashboard/LancamentosPage";
import FinanceiroPage from "./pages/dashboard/FinanceiroPage";
import RelatoriosPage from "./pages/dashboard/RelatoriosPage";
import DocumentosPage from "./pages/dashboard/DocumentosPage";
import BeneficiosPage from "./pages/dashboard/BeneficiosPage";
import EmpresaPage from "./pages/dashboard/EmpresaPage";
import ConfiguracoesPage from "./pages/dashboard/ConfiguracoesPage";
import EquipesPage from "./pages/dashboard/EquipesPage";
import ContabilidadePage from "./pages/dashboard/ContabilidadePage";

// Portal do Colaborador
import { PortalProvider } from "./contexts/PortalContext";
import PortalLayout from "./components/portal/PortalLayout";
import PortalGuard from "./components/portal/PortalGuard";
import PortalHome from "./pages/colaborador/PortalHome";
import MeuExtratoPage from "./pages/colaborador/MeuExtratoPage";
import MeusBeneficiosPage from "./pages/colaborador/MeusBeneficiosPage";
import MeusContracheques from "./pages/colaborador/MeusContracheques";

const queryClient = new QueryClient();

const App = () => (
  <QueryClientProvider client={queryClient}>
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
            <Route path="equipes" element={<EquipesPage />} />
            <Route path="lojas" element={<LojasPage />} />
            <Route path="ferias" element={<FeriasPage />} />
            <Route path="financeiro" element={<FinanceiroPage />} />
            <Route path="lancamentos" element={<LancamentosPage />} />
            <Route path="beneficios" element={<BeneficiosPage />} />
            <Route path="documentos" element={<DocumentosPage />} />
            <Route path="relatorios" element={<RelatoriosPage />} />
            <Route path="empresa" element={<EmpresaPage />} />
            <Route path="configuracoes" element={<ConfiguracoesPage />} />
            <Route path="contabilidade" element={<ContabilidadePage />} />
          </Route>

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
          
          <Route path="*" element={<NotFound />} />
        </Routes>
      </BrowserRouter>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
