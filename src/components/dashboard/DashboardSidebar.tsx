import { Link, useLocation } from "react-router-dom";
import { useDashboard, AppRole } from "@/contexts/DashboardContext";
import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarHeader,
  SidebarFooter,
  useSidebar,
  SidebarSeparator,
} from "@/components/ui/sidebar";
import { NavLink } from "@/components/NavLink";
import {
  LayoutDashboard,
  Users,
  Building2,
  FileText,
  DollarSign,
  Gift,
  BarChart3,
  Settings,
  Briefcase,
  FolderTree,
  LogOut,
} from "lucide-react";

interface NavItem {
  title: string;
  url: string;
  icon: React.ComponentType<{ className?: string }>;
  roles: AppRole[];
}

interface NavCategory {
  label: string;
  items: NavItem[];
}

const navCategories: NavCategory[] = [
  {
    label: "Principal",
    items: [
      {
        title: "Visão Geral",
        url: "/dashboard",
        icon: LayoutDashboard,
        roles: ["admin", "rh", "gestor", "contador", "colaborador"],
      },
    ],
  },
  {
    label: "Cadastros",
    items: [
      {
        title: "Colaboradores",
        url: "/dashboard/colaboradores",
        icon: Users,
        roles: ["admin", "rh", "gestor"],
      },
      {
        title: "Setores",
        url: "/dashboard/setores",
        icon: FolderTree,
        roles: ["admin", "rh", "gestor"],
      },
      {
        title: "Cargos",
        url: "/dashboard/cargos",
        icon: Briefcase,
        roles: ["admin", "rh"],
      },
      {
        title: "Empresas",
        url: "/dashboard/empresas",
        icon: Building2,
        roles: ["admin"],
      },
      {
        title: "Benefícios",
        url: "/dashboard/beneficios",
        icon: Gift,
        roles: ["admin", "rh"],
      },
    ],
  },
  {
    label: "Gestão",
    items: [
      {
        title: "Lançamentos Financeiro",
        url: "/dashboard/financeiro",
        icon: DollarSign,
        roles: ["admin", "rh", "contador"],
      },
      {
        title: "Relatórios",
        url: "/dashboard/relatorios",
        icon: BarChart3,
        roles: ["admin", "rh", "contador"],
      },
      {
        title: "Contabilidade",
        url: "/dashboard/contabilidade",
        icon: FileText,
        roles: ["contador", "admin", "rh"],
      },
    ],
  },
];

const DashboardSidebar = () => {
  const { hasAnyRole, signOut } = useDashboard();
  const location = useLocation();
  const { state } = useSidebar();
  const isCollapsed = state === "collapsed";

  const isActive = (url: string) => {
    if (url === "/dashboard") {
      return location.pathname === "/dashboard";
    }
    return location.pathname.startsWith(url);
  };

  // Filter categories and items based on roles
  const filteredCategories = navCategories
    .map((category) => ({
      ...category,
      items: category.items.filter((item) => hasAnyRole(item.roles)),
    }))
    .filter((category) => category.items.length > 0);

  return (
    <Sidebar collapsible="icon" className="border-r border-border">
      <SidebarHeader className="p-4 border-b border-border">
        <Link to="/dashboard" className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl gradient-hero flex items-center justify-center shadow-soft flex-shrink-0">
            <span className="text-primary-foreground font-bold text-lg">R</span>
          </div>
          {!isCollapsed && (
            <span className="text-lg font-bold text-foreground">RH360</span>
          )}
        </Link>
      </SidebarHeader>

      <SidebarContent className="gap-0">
        {filteredCategories.map((category, index) => (
          <div key={category.label}>
            {index > 0 && <SidebarSeparator className="my-1" />}
            <SidebarGroup className="py-1">
              <SidebarGroupLabel className="text-xs py-1">{category.label}</SidebarGroupLabel>
              <SidebarGroupContent>
                <SidebarMenu className="gap-0.5">
                  {category.items.map((item) => (
                    <SidebarMenuItem key={item.url}>
                      <SidebarMenuButton asChild isActive={isActive(item.url)} className="h-8">
                        <NavLink
                          to={item.url}
                          end={item.url === "/dashboard"}
                          className="flex items-center gap-2"
                          activeClassName="bg-primary/10 text-primary font-medium"
                        >
                          <item.icon className="w-4 h-4 flex-shrink-0" />
                          {!isCollapsed && <span className="text-sm">{item.title}</span>}
                        </NavLink>
                      </SidebarMenuButton>
                    </SidebarMenuItem>
                  ))}
                </SidebarMenu>
              </SidebarGroupContent>
            </SidebarGroup>
          </div>
        ))}
      </SidebarContent>

      <SidebarFooter className="p-2 border-t border-border">
        <SidebarMenu className="gap-0.5">
          <SidebarMenuItem>
            <SidebarMenuButton asChild isActive={isActive("/dashboard/configuracoes")} className="h-8">
              <NavLink
                to="/dashboard/configuracoes"
                className="flex items-center gap-2"
                activeClassName="bg-primary/10 text-primary font-medium"
              >
                <Settings className="w-4 h-4 flex-shrink-0" />
                {!isCollapsed && <span className="text-sm">Configurações</span>}
              </NavLink>
            </SidebarMenuButton>
          </SidebarMenuItem>
          <SidebarMenuItem>
            <SidebarMenuButton 
              className="h-8 text-muted-foreground hover:text-destructive hover:bg-destructive/10"
              onClick={signOut}
            >
              <LogOut className="w-4 h-4 flex-shrink-0" />
              {!isCollapsed && <span className="text-sm">Sair</span>}
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarFooter>
    </Sidebar>
  );
};

export default DashboardSidebar;