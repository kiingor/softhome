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
  Calendar,
  FileText,
  DollarSign,
  Gift,
  BarChart3,
  Settings,
  Briefcase,
  ChevronDown,
  FolderTree,
} from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

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
        title: "Férias e Ausências",
        url: "/dashboard/ferias",
        icon: Calendar,
        roles: ["admin", "rh", "gestor", "colaborador"],
      },
      {
        title: "Lançamentos Financeiro",
        url: "/dashboard/financeiro",
        icon: DollarSign,
        roles: ["admin", "rh", "contador"],
      },
    ],
  },
  {
    label: "Relatórios",
    items: [
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
  const { hasAnyRole, stores, currentStore, setCurrentStore } = useDashboard();
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

        {/* Store Selector */}
        {!isCollapsed && stores.length > 0 && (
          <DropdownMenu>
            <DropdownMenuTrigger className="w-full mt-2 p-3 rounded-lg bg-muted hover:bg-muted/80 transition-colors text-left">
              <div className="flex items-center justify-between">
                <div className="min-w-0">
                  <p className="text-xs text-muted-foreground">Empresa</p>
                  <p className="font-medium text-foreground truncate">
                    {currentStore?.store_name || "Todas as empresas"}
                  </p>
                </div>
                <ChevronDown className="w-4 h-4 text-muted-foreground flex-shrink-0" />
              </div>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start" className="w-56">
              <DropdownMenuItem
                onClick={() => setCurrentStore(null)}
                className={!currentStore ? "bg-secondary" : ""}
              >
                Todas as empresas
              </DropdownMenuItem>
              {stores.map((store) => (
                <DropdownMenuItem
                  key={store.id}
                  onClick={() => setCurrentStore(store)}
                  className={currentStore?.id === store.id ? "bg-secondary" : ""}
                >
                  {store.store_name}
                  {store.store_code && (
                    <span className="text-muted-foreground ml-2">
                      ({store.store_code})
                    </span>
                  )}
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
        )}
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
        <SidebarMenu>
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
        </SidebarMenu>
      </SidebarFooter>
    </Sidebar>
  );
};

export default DashboardSidebar;