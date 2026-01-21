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
import { LogOut, User, Settings, Clock } from "lucide-react";
import { useNavigate, Link } from "react-router-dom";
import { Badge } from "@/components/ui/badge";
import { NotificationBell } from "./NotificationBell";
import { differenceInDays } from "date-fns";

const roleLabels: Record<string, string> = {
  admin: "Administrador",
  rh: "RH",
  gestor: "Gestor",
  contador: "Contador",
  colaborador: "Colaborador",
};

const DashboardHeader = () => {
  const { user, profile, roles, currentCompany, signOut } = useDashboard();
  const navigate = useNavigate();

  const handleSignOut = async () => {
    await signOut();
    navigate("/");
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

  // Calculate trial days remaining
  const trialDaysRemaining = currentCompany?.trial_ends_at 
    ? Math.max(0, differenceInDays(new Date(currentCompany.trial_ends_at), new Date()))
    : 0;

  const isTrial = currentCompany?.subscription_status !== 'active' && 
                  currentCompany?.trial_ends_at && 
                  trialDaysRemaining > 0;

  return (
    <header className="h-16 border-b border-border bg-card flex items-center justify-between px-6 sticky top-0 z-40">
      <div className="flex items-center gap-4">
        <div className="hidden sm:block">
          {currentCompany && (
            <div>
              <h1 className="font-bold text-foreground">{currentCompany.company_name}</h1>
              <p className="text-xs text-muted-foreground">
                Plano {currentCompany.plan_type === "essencial" ? "Essencial" : 
                       currentCompany.plan_type === "crescer" ? "Crescer" :
                       currentCompany.plan_type === "profissional" ? "Profissional" : "Empresa+"}
              </p>
            </div>
          )}
        </div>
      </div>

      <div className="flex items-center gap-3">
        {/* Trial Badge */}
        {isTrial && (
          <Link to="/dashboard/configuracoes?tab=plano">
            <Badge 
              variant="outline" 
              className="cursor-pointer hover:bg-primary/10 gap-1.5 border-primary/50 text-primary"
            >
              <Clock className="w-3 h-3" />
              Trial: {trialDaysRemaining} dia{trialDaysRemaining !== 1 ? 's' : ''}
            </Badge>
          </Link>
        )}

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
            <DropdownMenuItem onClick={() => navigate("/dashboard/perfil")}>
              <User className="w-4 h-4 mr-2" />
              Meu Perfil
            </DropdownMenuItem>
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
