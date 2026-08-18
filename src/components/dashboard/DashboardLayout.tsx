import { useEffect, useState } from "react";
import { Outlet, Navigate } from "react-router-dom";
import { DashboardProvider, useDashboard } from "@/contexts/DashboardContext";
import DashboardSidebar from "@/components/dashboard/DashboardSidebar";
import DashboardHeader from "@/components/dashboard/DashboardHeader";
import GlobalSearch from "@/components/GlobalSearch";
import { BrandLogo } from "@/components/branding/BrandLogo";
import SessionTimeoutGuard from "@/components/security/SessionTimeoutGuard";
import { DASHBOARD_SESSION_POLICY } from "@/lib/security/session-policy";
import { useMfaGate } from "@/hooks/useLoginMfa";
import MfaLoginChallenge from "@/components/security/MfaLoginChallenge";
import MfaEnrollNudge from "@/components/security/MfaEnrollNudge";

// Papéis que enxergam o painel interno. `colaborador` não está aqui de
// propósito: o lugar dele é o Portal.
const DASHBOARD_ROLES = [
  "admin",
  "admin_gc",
  "rh",
  "gestor_gc",
  "gestor",
  "contador",
  "diretoria",
] as const;

const DashboardLayoutContent = () => {
  const { user, roles, isLoading, signOut } = useDashboard();
  const [searchOpen, setSearchOpen] = useState(false);
  // Guard do 2º fator: só consulta quando já há usuário. `stepUpPassed` evita
  // qualquer flash da tela de código depois que a sessão vira AAL2.
  const { data: mfaGate, isLoading: mfaLoading } = useMfaGate(!!user);
  const [stepUpPassed, setStepUpPassed] = useState(false);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const isMod = e.ctrlKey || e.metaKey;
      if (isMod && (e.key === "k" || e.key === "K")) {
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
          <BrandLogo size="lg" pulse className="mx-auto mb-4" />
          <p className="text-muted-foreground">Carregando...</p>
        </div>
      </div>
    );
  }

  if (!user) {
    return <Navigate to="/login" replace />;
  }

  // Um colaborador do Portal que digitasse /dashboard na URL entrava no painel
  // interno: o guard só checava se havia sessão. A RLS impedia que ele visse
  // dados, mas a navegação, os nomes de módulo e a estrutura ficavam expostos.
  //
  // A checagem é deliberadamente estreita — só barra quem TEM o papel
  // `colaborador` e nenhum papel de painel. Quem tira autoridade só de
  // `user_permissions` (sem linha em `user_roles`) continua entrando, senão
  // esse guard viraria um lockout.
  const isPortalOnly =
    roles.includes("colaborador") &&
    !roles.some((role) => (DASHBOARD_ROLES as readonly string[]).includes(role));

  if (isPortalOnly) {
    return <Navigate to="/colaborador" replace />;
  }

  // 2º fator no login: enquanto o estado do MFA carrega, segura a tela (evita
  // pintar páginas que a RLS vai bloquear em AAL1). Se o usuário tem fator
  // verificado e a sessão está em AAL1, exige o código antes de qualquer coisa.
  // Erro/indisponibilidade da consulta não tranca ninguém — a RLS é a barreira
  // dura; esta tela é só a experiência.
  if (mfaLoading && !mfaGate) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="text-center">
          <BrandLogo size="lg" pulse className="mx-auto mb-4" />
          <p className="text-muted-foreground">Carregando...</p>
        </div>
      </div>
    );
  }

  if (mfaGate?.needsStepUp && mfaGate.verifiedPhone && !stepUpPassed) {
    return (
      <MfaLoginChallenge
        factor={mfaGate.verifiedPhone}
        onVerified={() => setStepUpPassed(true)}
        onCancel={() => void signOut()}
      />
    );
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
      <SessionTimeoutGuard
        policy={DASHBOARD_SESSION_POLICY}
        enabled={!!user}
        serverSessionStartedAt={user.last_sign_in_at}
        redirectTo="/login"
      />
      <MfaEnrollNudge />
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
