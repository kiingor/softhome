import { useEffect, useState } from "react";
import { Outlet, Navigate } from "react-router-dom";
import { DashboardProvider, useDashboard } from "@/contexts/DashboardContext";
import DashboardSidebar from "@/components/dashboard/DashboardSidebar";
import DashboardHeader from "@/components/dashboard/DashboardHeader";
import GlobalSearch from "@/components/GlobalSearch";

const DashboardLayoutContent = () => {
  const { user, isLoading } = useDashboard();
  const [searchOpen, setSearchOpen] = useState(false);

  // Atalhos: Ctrl+K (padrão) e Ctrl+F (sobrescreve find do browser quando
  // foco tá em qualquer lugar do app)
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const isMod = e.ctrlKey || e.metaKey;
      if (isMod && (e.key === "k" || e.key === "K" || e.key === "f" || e.key === "F")) {
        e.preventDefault();
        setSearchOpen((prev) => !prev);
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, []);

  if (isLoading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="text-center">
          <div className="w-12 h-12 rounded-xl gradient-hero flex items-center justify-center shadow-soft mx-auto mb-4 animate-pulse">
            <span className="text-primary-foreground font-extrabold text-xl">S</span>
          </div>
          <p className="text-muted-foreground">Carregando...</p>
        </div>
      </div>
    );
  }

  if (!user) {
    return <Navigate to="/login" replace />;
  }

  return (
    <div className="h-screen flex w-full bg-background overflow-hidden">
      <DashboardSidebar />
      <div className="flex-1 flex flex-col min-w-0 h-full">
        <DashboardHeader onOpenSearch={() => setSearchOpen(true)} />
        <main className="flex-1 p-6 overflow-auto">
          <Outlet />
        </main>
      </div>
      <GlobalSearch open={searchOpen} onOpenChange={setSearchOpen} />
    </div>
  );
};

const DashboardLayout = () => {
  return (
    <DashboardProvider>
      <DashboardLayoutContent />
    </DashboardProvider>
  );
};

export default DashboardLayout;
