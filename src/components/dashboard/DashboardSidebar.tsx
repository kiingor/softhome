import { Link, useLocation, useNavigate } from "react-router-dom";
import { useDashboard, AppRole } from "@/contexts/DashboardContext";
import { supabase } from "@/integrations/supabase/client";
import {
  LayoutDashboard,
  Users,
  Building2,
  Briefcase,
  Gift,
  FileText,
  BarChart3,
  Settings,
  LogOut,
  FolderTree,
  DollarSign,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { useToast } from "@/hooks/use-toast";

interface MenuItem {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  href: string;
  roles: AppRole[];
}

interface MenuCategory {
  label: string;
  items: MenuItem[];
}

const menuCategories: MenuCategory[] = [
  {
    label: "Principal",
    items: [
      { icon: LayoutDashboard, label: "Visão Geral", href: "/dashboard", roles: ["admin", "rh", "gestor", "contador", "colaborador"] },
    ],
  },
  {
    label: "Cadastros",
    items: [
      { icon: Users, label: "Colaboradores", href: "/dashboard/colaboradores", roles: ["admin", "rh", "gestor"] },
      { icon: FolderTree, label: "Setores", href: "/dashboard/setores", roles: ["admin", "rh", "gestor"] },
      { icon: Briefcase, label: "Cargos", href: "/dashboard/cargos", roles: ["admin", "rh"] },
      { icon: Building2, label: "Empresas", href: "/dashboard/empresas", roles: ["admin"] },
      { icon: Gift, label: "Benefícios", href: "/dashboard/beneficios", roles: ["admin", "rh"] },
    ],
  },
  {
    label: "Gestão",
    items: [
      { icon: DollarSign, label: "Lançamentos", href: "/dashboard/financeiro", roles: ["admin", "rh", "contador"] },
      { icon: BarChart3, label: "Relatórios", href: "/dashboard/relatorios", roles: ["admin", "rh", "contador"] },
      { icon: FileText, label: "Contabilidade", href: "/dashboard/contabilidade", roles: ["admin", "rh", "contador"] },
    ],
  },
];

export default function DashboardSidebar() {
  const { hasAnyRole } = useDashboard();
  const location = useLocation();
  const navigate = useNavigate();
  const { toast } = useToast();

  // Filter categories and items based on roles
  const visibleCategories = menuCategories
    .map(category => ({
      ...category,
      items: category.items.filter(item => hasAnyRole(item.roles)),
    }))
    .filter(category => category.items.length > 0);

  async function handleLogout() {
    await supabase.auth.signOut();
    toast({ title: "Logout realizado com sucesso" });
    navigate("/login");
  }

  return (
    <aside className="w-64 border-r border-border bg-card flex flex-col">
      {/* Header com logo */}
      <div className="h-16 px-6 border-b border-border flex items-center">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl gradient-hero flex items-center justify-center shadow-soft">
            <span className="text-primary-foreground font-bold text-xl">M</span>
          </div>
          <div>
            <h1 className="font-bold text-foreground">Meu RH</h1>
            <p className="text-xs text-muted-foreground">Gestão de Pessoas</p>
          </div>
        </div>
      </div>

      {/* Menu de navegação */}
      <nav className="flex-1 p-4 overflow-auto">
        {visibleCategories.map((category, categoryIndex) => (
          <div key={category.label}>
            {categoryIndex > 0 && (
              <div className="my-3 border-t border-border" />
            )}
            <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-2 px-4">
              {category.label}
            </p>
            <div className="space-y-1">
              {category.items.map((item) => {
                const isActive = location.pathname === item.href || 
                  (item.href !== "/dashboard" && location.pathname.startsWith(item.href));
                return (
                  <Link
                    key={item.href}
                    to={item.href}
                    className={cn(
                      "flex items-center gap-3 px-4 py-3 rounded-lg transition-colors",
                      isActive
                        ? "bg-primary/10 text-primary font-medium"
                        : "text-muted-foreground hover:bg-muted hover:text-foreground"
                    )}
                  >
                    <item.icon className="w-5 h-5" />
                    {item.label}
                  </Link>
                );
              })}
            </div>
          </div>
        ))}
      </nav>

      {/* Footer */}
      <div className="p-4 border-t border-border space-y-1">
        <Link
          to="/dashboard/configuracoes"
          className={cn(
            "flex items-center gap-3 px-4 py-3 rounded-lg transition-colors w-full",
            location.pathname === "/dashboard/configuracoes"
              ? "bg-primary/10 text-primary font-medium"
              : "text-muted-foreground hover:bg-muted hover:text-foreground"
          )}
        >
          <Settings className="w-5 h-5" />
          Configurações
        </Link>
        <Button
          variant="ghost"
          className="w-full justify-start gap-3 text-muted-foreground px-4 py-3 h-auto"
          onClick={handleLogout}
        >
          <LogOut className="w-5 h-5" />
          Sair
        </Button>
      </div>
    </aside>
  );
}
