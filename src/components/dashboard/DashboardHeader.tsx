import { useDashboard } from "@/contexts/DashboardContext";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { SignOut as LogOut, Gear as Settings, MagnifyingGlass } from "@phosphor-icons/react";
import { useNavigate } from "react-router-dom";
import { Badge } from "@/components/ui/badge";
import { NotificationBell } from "./NotificationBell";

const roleLabels: Record<string, string> = {
  admin_gc: "Administrador G&C",
  gestor_gc: "Gestor G&C",
  gestor: "Gestor",
  contador: "Contador",
  colaborador: "Colaborador",
};

interface DashboardHeaderProps {
  onOpenSearch?: () => void;
}

const DashboardHeader = ({ onOpenSearch }: DashboardHeaderProps = {}) => {
  const { user, profile, roles, signOut } = useDashboard();
  const navigate = useNavigate();
  const isMac = typeof navigator !== "undefined" && /Mac|iPhone|iPad|iPod/.test(navigator.platform);

  const handleSignOut = async () => {
    await signOut();
    navigate("/login");
  };

  const getInitials = () => {
    if (profile?.full_name) {
      return profile.full_name
        .split(" ")
        .map(n => n[0])
        .join("")
        .toUpperCase()
        .slice(0, 2);
    }
    return user?.email?.[0]?.toUpperCase() || "U";
  };

  const primaryRole = roles[0];

  return (
    <header className="h-16 border-b border-border bg-card flex items-center justify-between px-6 sticky top-0 z-40">
      <div className="flex items-center gap-4">
        {onOpenSearch && (
          <button
            type="button"
            onClick={onOpenSearch}
            className="group flex items-center gap-2 px-3 h-9 w-72 rounded-md border border-input bg-background text-sm text-muted-foreground hover:bg-accent hover:text-accent-foreground hover:border-accent transition-colors"
          >
            <MagnifyingGlass className="h-4 w-4" />
            <span className="flex-1 text-left">Buscar no SoftHouse...</span>
            <kbd className="hidden md:inline-flex items-center gap-1 rounded border bg-muted px-1.5 font-mono text-[10px] text-muted-foreground group-hover:bg-accent-foreground/15 group-hover:text-accent-foreground group-hover:border-accent-foreground/30">
              {isMac ? "⌘" : "Ctrl"}+K
            </kbd>
          </button>
        )}
      </div>

      <div className="flex items-center gap-3">
        {/* Notifications */}
        <NotificationBell />

        {/* User Menu */}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" className="flex items-center gap-3 px-2">
              <Avatar className="w-8 h-8">
                <AvatarFallback className="bg-primary/10 text-primary font-semibold text-sm">
                  {getInitials()}
                </AvatarFallback>
              </Avatar>
              <div className="hidden md:block text-left">
                <p className="text-sm font-medium text-foreground">
                  {profile?.full_name || user?.email?.split("@")[0]}
                </p>
                {primaryRole && (
                  <Badge variant="secondary" className="text-xs font-normal">
                    {roleLabels[primaryRole] || primaryRole}
                  </Badge>
                )}
              </div>
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-56">
            <DropdownMenuLabel>
              <div className="flex flex-col">
                <span className="font-medium">{profile?.full_name || "Usuário"}</span>
                <span className="text-xs text-muted-foreground font-normal">{user?.email}</span>
              </div>
            </DropdownMenuLabel>
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={() => navigate("/dashboard/configuracoes")}>
              <Settings className="w-4 h-4 mr-2" />
              Configurações
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={handleSignOut} className="text-destructive focus:text-destructive">
              <LogOut className="w-4 h-4 mr-2" />
              Sair
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </header>
  );
};

export default DashboardHeader;
