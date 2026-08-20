import { useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { useTheme } from "next-themes";
import { useDashboard } from "@/contexts/DashboardContext";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  SignOut as LogOut,
  Gear as Settings,
  MagnifyingGlass,
  Key,
  Moon,
  Sun,
  CaretDown,
} from "@phosphor-icons/react";
import { NotificationBell } from "./NotificationBell";
import { ChangePasswordDialog } from "./ChangePasswordDialog";
import { resolverCabecalho } from "@/components/dashboard/menu";
import { cn } from "@/lib/utils";

const roleLabels: Record<string, string> = {
  admin: "Administrador G&C",
  admin_gc: "Administrador G&C",
  diretoria: "Diretoria",
  rh: "RH",
  gestor_gc: "Gestor G&C",
  gestor: "Gestor",
  contador: "Contador",
  colaborador: "Colaborador",
};

interface DashboardHeaderProps {
  onOpenSearch?: () => void;
}

/** Botão de ação do cabeçalho: 40px de alvo, sem preenchimento em repouso. */
function BotaoIcone({
  onClick, titulo, children,
}: {
  onClick?: () => void;
  titulo: string;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={titulo}
      aria-label={titulo}
      className={cn(
        "flex h-10 w-10 items-center justify-center rounded-md text-muted-foreground",
        "transition-colors hover:bg-muted hover:text-foreground",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
      )}
    >
      {children}
    </button>
  );
}

const DashboardHeader = ({ onOpenSearch }: DashboardHeaderProps = {}) => {
  const { user, profile, roles, signOut } = useDashboard();
  const navigate = useNavigate();
  const location = useLocation();
  const { theme, setTheme } = useTheme();
  const [changePasswordOpen, setChangePasswordOpen] = useState(false);
  const isMac = typeof navigator !== "undefined" && /Mac|iPhone|iPad|iPod/.test(navigator.platform);

  const { grupo, titulo } = resolverCabecalho(location.pathname);
  const escuro = theme === "dark";

  const handleSignOut = async () => {
    await signOut();
    navigate("/login");
  };

  const getInitials = () => {
    if (profile?.full_name) {
      return profile.full_name
        .split(" ")
        .map((n) => n[0])
        .join("")
        .toUpperCase()
        .slice(0, 2);
    }
    return user?.email?.[0]?.toUpperCase() || "U";
  };

  const primaryRole = roles[0];
  const nomeExibido = profile?.full_name || user?.email?.split("@")[0];

  return (
    <header className="sticky top-0 z-40 flex items-center justify-between gap-4 border-b border-border bg-card px-8 py-4">
      {/* breadcrumb + título: o grupo em caixa alta abre, o título carrega o peso */}
      <div className="min-w-0">
        <p className="label-eyebrow">{grupo}</p>
        <h1 className="page-title truncate">{titulo}</h1>
      </div>

      <div className="flex shrink-0 items-center gap-1">
        {onOpenSearch && (
          <BotaoIcone onClick={onOpenSearch} titulo={`Buscar (${isMac ? "⌘" : "Ctrl"}+K)`}>
            <MagnifyingGlass className="h-[18px] w-[18px]" />
          </BotaoIcone>
        )}

        <BotaoIcone
          onClick={() => setTheme(escuro ? "light" : "dark")}
          titulo={escuro ? "Tema claro" : "Tema escuro"}
        >
          {escuro ? <Sun className="h-[18px] w-[18px]" /> : <Moon className="h-[18px] w-[18px]" />}
        </BotaoIcone>

        <NotificationBell />

        <div className="mx-2 h-8 w-px bg-border" aria-hidden />

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button
              type="button"
              className={cn(
                "flex items-center gap-3 rounded-md py-1.5 pl-1.5 pr-2 transition-colors hover:bg-muted",
                "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
              )}
            >
              <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-foreground text-[13px] font-bold text-background">
                {getInitials()}
              </span>
              <span className="hidden text-left md:block">
                <span className="block max-w-[180px] truncate text-sm font-semibold leading-tight text-foreground">
                  {nomeExibido}
                </span>
                <span className="block max-w-[180px] truncate text-xs leading-tight text-muted-foreground">
                  {primaryRole ? roleLabels[primaryRole] || primaryRole : user?.email}
                </span>
              </span>
              <CaretDown className="hidden h-3.5 w-3.5 text-muted-foreground md:block" />
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-60">
            <DropdownMenuLabel>
              <div className="flex flex-col">
                <span className="font-semibold">{profile?.full_name || "Usuário"}</span>
                <span className="text-xs font-normal text-muted-foreground">{user?.email}</span>
              </div>
            </DropdownMenuLabel>
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={() => setTheme(escuro ? "light" : "dark")}>
              {escuro ? <Sun className="mr-2 h-4 w-4" /> : <Moon className="mr-2 h-4 w-4" />}
              {escuro ? "Tema claro" : "Tema escuro"}
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => navigate("/dashboard/configuracoes")}>
              <Settings className="mr-2 h-4 w-4" />
              Configurações
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => setChangePasswordOpen(true)}>
              <Key className="mr-2 h-4 w-4" />
              Alterar senha
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={handleSignOut} className="text-destructive focus:text-destructive">
              <LogOut className="mr-2 h-4 w-4" />
              Sair
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      <ChangePasswordDialog open={changePasswordOpen} onOpenChange={setChangePasswordOpen} />
    </header>
  );
};

export default DashboardHeader;
