import { useDashboard } from "@/contexts/DashboardContext";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Users, FileText, CurrencyDollar as DollarSign, TrendUp as TrendingUp, UserPlus, Buildings as Building2, Briefcase, Gift, Cake } from "@phosphor-icons/react";
import { useNavigate } from "react-router-dom";

import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { TableSkeleton } from "@/components/ui/table-skeleton";
import {
  PieChart,
  Pie,
  Cell,
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
} from "recharts";
import { format, parseISO, isThisMonth } from "date-fns";
import { ptBR } from "date-fns/locale";
import { useMultiplePermissions } from "@/hooks/useMultiplePermissions";
import { ModuleType } from "@/hooks/usePermissions";

const COLORS = ["hsl(var(--primary))", "hsl(var(--accent))", "hsl(var(--chart-3))", "hsl(var(--chart-4))", "hsl(var(--chart-5))"];

const DashboardHome = () => {
  const { profile, currentCompany } = useDashboard();
  const navigate = useNavigate();

  // Get permissions for all modules to filter quick actions and UI
  const { canViewModule, isLoading: permissionsLoading, isAdmin } = useMultiplePermissions([
    "colaboradores",
    "financeiro",
    "relatorios",
    "beneficios",
    "setores",
    "cargos",
    "empresas",
    "contabilidade",
    "permissoes",
  ] as ModuleType[]);

  // Check if user has any management permission (for showing admin UI)
  const hasAnyManagementPermission = isAdmin || 
    canViewModule("colaboradores") || 
    canViewModule("financeiro") || 
    canViewModule("relatorios");

  // Fetch collaborators count
  const { data: collaborators = [], isLoading: loadingCollaborators } = useQuery({
    queryKey: ["dashboard-collaborators", currentCompany?.id],
    queryFn: async () => {
      if (!currentCompany?.id) return [];
      const { data, error } = await supabase
        .from("collaborators")
        .select("id, name, status, position_id, store_id, admission_date, birth_date")
        .eq("company_id", currentCompany.id);
      if (error) throw error;
      return data || [];
    },
    enabled: !!currentCompany?.id,
  });

  // Fetch stores count
  const { data: stores = [], isLoading: loadingStores } = useQuery({
    queryKey: ["dashboard-stores", currentCompany?.id],
    queryFn: async () => {
      if (!currentCompany?.id) return [];
      const { data, error } = await supabase
        .from("stores")
        .select("id, store_name")
        .eq("company_id", currentCompany.id);
      if (error) throw error;
      return data || [];
    },
    enabled: !!currentCompany?.id,
  });

  // Fetch positions
  const { data: positions = [], isLoading: loadingPositions } = useQuery({
    queryKey: ["dashboard-positions", currentCompany?.id],
    queryFn: async () => {
      if (!currentCompany?.id) return [];
      const { data, error } = await supabase
        .from("positions")
        .select("id, name, salary")
        .eq("company_id", currentCompany.id);
      if (error) throw error;
      return data || [];
    },
    enabled: !!currentCompany?.id,
  });

  // Fetch benefits
  const { data: benefits = [], isLoading: loadingBenefits } = useQuery({
    queryKey: ["dashboard-benefits", currentCompany?.id],
    queryFn: async () => {
      if (!currentCompany?.id) return [];
      const { data, error } = await supabase
        .from("benefits")
        .select("id, name, value")
        .eq("company_id", currentCompany.id);
      if (error) throw error;
      return data || [];
    },
    enabled: !!currentCompany?.id,
  });

  // Fetch payroll entries for current month
  const { data: payrollEntries = [], isLoading: loadingPayroll } = useQuery({
    queryKey: ["dashboard-payroll", currentCompany?.id],
    queryFn: async () => {
      if (!currentCompany?.id) return [];
      const currentMonth = new Date().getMonth() + 1;
      const currentYear = new Date().getFullYear();
      const { data, error } = await supabase
        .from("payroll_entries")
        .select("id, value, type")
        .eq("company_id", currentCompany.id)
        .eq("month", currentMonth)
        .eq("year", currentYear);
      if (error) throw error;
      return data || [];
    },
    enabled: !!currentCompany?.id,
  });

  const isLoading = loadingCollaborators || loadingStores || loadingPositions || loadingBenefits || loadingPayroll;

  // Calculate stats
  const activeCollaborators = collaborators.filter((c) => c.status === "ativo").length;
  const inactiveCollaborators = collaborators.filter((c) => c.status === "inativo").length;
  const totalPayroll = payrollEntries.reduce((sum, e) => sum + Number(e.value), 0);

  // Birthdays this month
  const birthdaysThisMonth = collaborators.filter((c) => {
    if (!c.birth_date) return false;
    const birthDate = parseISO(c.birth_date);
    return isThisMonth(birthDate);
  });

  // Collaborators by position chart data
  const collaboratorsByPosition = positions.map((pos) => ({
    name: pos.name,
    value: collaborators.filter((c) => c.position_id === pos.id).length,
  })).filter((item) => item.value > 0);

  // Collaborators by store chart data
  const collaboratorsByStore = stores.map((store) => ({
    name: store.store_name,
    colaboradores: collaborators.filter((c) => c.store_id === store.id).length,
  })).filter((item) => item.colaboradores > 0);

  // Payroll by type chart data
  const payrollByType = [
    { name: "Salário base", value: payrollEntries.filter((e) => e.type === "salario_base").reduce((sum, e) => sum + Number(e.value), 0) },
    { name: "Hora extra", value: payrollEntries.filter((e) => e.type === "hora_extra").reduce((sum, e) => sum + Number(e.value), 0) },
    { name: "Benefício", value: payrollEntries.filter((e) => e.type === "beneficio").reduce((sum, e) => sum + Number(e.value), 0) },
    { name: "Bonificação", value: payrollEntries.filter((e) => e.type === "bonificacao").reduce((sum, e) => sum + Number(e.value), 0) },
    { name: "Desconto", value: payrollEntries.filter((e) => e.type === "desconto").reduce((sum, e) => sum + Number(e.value), 0) },
  ].filter((item) => item.value > 0);

  // Stats cards
  const adminStats = [
    { label: "Colaboradores Ativos", value: activeCollaborators.toString(), icon: Users, color: "bg-primary/10 text-primary" },
    { label: "Empresas/Lojas", value: stores.length.toString(), icon: Building2, color: "bg-accent/10 text-accent" },
    { label: "Lançamentos do Mês", value: `R$ ${totalPayroll.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}`, icon: DollarSign, color: "bg-green-100 text-green-600" },
    { label: "Cargos Cadastrados", value: positions.length.toString(), icon: Briefcase, color: "bg-orange-100 text-orange-600" },
  ];

  // Build quick actions based on permissions
  // If user has no management permissions, show collaborator-style actions
  const allQuickActions = !hasAnyManagementPermission
    ? [
        { label: "Meus Documentos", icon: FileText, action: () => navigate("/colaborador/contracheques"), module: null },
        { label: "Meus Benefícios", icon: DollarSign, action: () => navigate("/colaborador/beneficios"), module: null },
      ]
    : [
        { label: "Novo Colaborador", icon: UserPlus, action: () => navigate("/dashboard/colaboradores"), module: "colaboradores" as ModuleType },
        { label: "Folha", icon: DollarSign, action: () => navigate("/dashboard/folha"), module: "folha" as ModuleType },
        { label: "Relatórios", icon: TrendingUp, action: () => navigate("/dashboard/relatorios"), module: "relatorios" as ModuleType },
        { label: "Benefícios", icon: Gift, action: () => navigate("/dashboard/beneficios"), module: "beneficios" as ModuleType },
      ];

  // Filter quick actions based on permissions
  const quickActions = allQuickActions.filter(action => {
    // Collaborator actions don't need permission check
    if (action.module === null) return true;
    // Admin always sees all
    if (isAdmin) return true;
    // Check module permission
    return canViewModule(action.module);
  });

  if (isLoading) {
    return (
      <div className="space-y-8 animate-fade-in">
        <div>
          <div className="h-8 w-48 bg-muted rounded animate-pulse mb-2" />
          <div className="h-5 w-64 bg-muted rounded animate-pulse" />
        </div>
        <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {[1, 2, 3, 4].map((i) => (
            <Card key={i} className="border border-border">
              <CardContent className="p-6">
                <div className="flex items-start justify-between">
                  <div className="space-y-2">
                    <div className="h-4 w-24 bg-muted rounded animate-pulse" />
                    <div className="h-8 w-16 bg-muted rounded animate-pulse" />
                  </div>
                  <div className="w-12 h-12 rounded-xl bg-muted animate-pulse" />
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
        <TableSkeleton columns={4} rows={3} />
      </div>
    );
  }

  return (
    <div className="space-y-8 animate-fade-in">
      {/* Welcome Section */}
      <div className="animate-slide-up">
        <h1 className="text-2xl md:text-3xl font-bold text-foreground">
          Olá{profile?.full_name ? `, ${profile.full_name.split(" ")[0]}` : ""}! 👋
        </h1>
        <p className="text-muted-foreground mt-1">
          {!hasAnyManagementPermission
            ? "Acompanhe suas informações e solicitações."
            : `Aqui está o resumo de ${currentCompany?.company_name || "sua empresa"} hoje.`}
        </p>
      </div>

      {/* Stats Grid */}
      {hasAnyManagementPermission && (
        <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {adminStats.map((stat, index) => (
            <Card
              key={index}
              className="border border-border hover:shadow-soft transition-all duration-300 animate-scale-in"
              style={{ animationDelay: `${index * 100}ms` }}
            >
              <CardContent className="p-6">
                <div className="flex items-start justify-between">
                  <div>
                    <p className="text-sm text-muted-foreground mb-1">{stat.label}</p>
                    <p className="text-2xl font-bold text-foreground">{stat.value}</p>
                  </div>
                  <div className={`w-12 h-12 rounded-xl ${stat.color} flex items-center justify-center`}>
                    <stat.icon className="w-6 h-6" />
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Quick Actions */}
      <div className="animate-slide-up" style={{ animationDelay: "200ms" }}>
        <h2 className="text-lg font-semibold text-foreground mb-4">Ações Rápidas</h2>
        <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {quickActions.map((action, index) => (
            <Card
              key={index}
              className="border border-border hover:border-primary/30 hover:shadow-soft transition-all cursor-pointer group"
              onClick={action.action}
            >
              <CardContent className="p-6 flex items-center gap-4">
                <div className="w-12 h-12 rounded-xl bg-secondary flex items-center justify-center group-hover:bg-primary/10 transition-colors">
                  <action.icon className="w-6 h-6 text-muted-foreground group-hover:text-primary transition-colors" />
                </div>
                <span className="font-medium text-foreground">{action.label}</span>
              </CardContent>
            </Card>
          ))}
        </div>
      </div>

      {/* Charts Section */}
      {hasAnyManagementPermission && collaborators.length > 0 && (
        <div className="grid lg:grid-cols-2 gap-6 animate-slide-up" style={{ animationDelay: "300ms" }}>
          {/* Collaborators by Position */}
          {collaboratorsByPosition.length > 0 && (
            <Card className="border border-border">
              <CardHeader>
                <CardTitle className="text-lg flex items-center gap-2">
                  <Briefcase className="w-5 h-5 text-primary" />
                  Colaboradores por Cargo
                </CardTitle>
              </CardHeader>
              <CardContent>
                <ResponsiveContainer width="100%" height={250}>
                  <PieChart>
                    <Pie
                      data={collaboratorsByPosition}
                      cx="50%"
                      cy="50%"
                      labelLine={false}
                      label={({ name, percent }) => `${name} (${(percent * 100).toFixed(0)}%)`}
                      outerRadius={80}
                      fill="#8884d8"
                      dataKey="value"
                    >
                      {collaboratorsByPosition.map((_, index) => (
                        <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                      ))}
                    </Pie>
                    <Tooltip />
                  </PieChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>
          )}

          {/* Collaborators by Store */}
          {collaboratorsByStore.length > 0 && (
            <Card className="border border-border">
              <CardHeader>
                <CardTitle className="text-lg flex items-center gap-2">
                  <Building2 className="w-5 h-5 text-accent" />
                  Colaboradores por Empresa
                </CardTitle>
              </CardHeader>
              <CardContent>
                <ResponsiveContainer width="100%" height={250}>
                  <BarChart data={collaboratorsByStore}>
                    <XAxis dataKey="name" tick={{ fontSize: 12 }} />
                    <YAxis tick={{ fontSize: 12 }} />
                    <Tooltip />
                    <Bar dataKey="colaboradores" fill="hsl(var(--primary))" radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>
          )}

          {/* Payroll Distribution */}
          {payrollByType.length > 0 && (
            <Card className="border border-border">
              <CardHeader>
                <CardTitle className="text-lg flex items-center gap-2">
                  <DollarSign className="w-5 h-5 text-green-600" />
                  Distribuição de Lançamentos ({format(new Date(), "MMMM", { locale: ptBR })})
                </CardTitle>
              </CardHeader>
              <CardContent>
                <ResponsiveContainer width="100%" height={250}>
                  <PieChart>
                    <Pie
                      data={payrollByType}
                      cx="50%"
                      cy="50%"
                      labelLine={false}
                      label={({ name, value }) => `${name}: R$ ${value.toLocaleString("pt-BR")}`}
                      outerRadius={80}
                      fill="#8884d8"
                      dataKey="value"
                    >
                      {payrollByType.map((_, index) => (
                        <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                      ))}
                    </Pie>
                    <Tooltip formatter={(value) => `R$ ${Number(value).toLocaleString("pt-BR")}`} />
                  </PieChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>
          )}

          {/* Birthdays This Month */}
          <Card className="border border-border">
            <CardHeader>
              <CardTitle className="text-lg flex items-center gap-2">
                <Cake className="w-5 h-5 text-pink-500" />
                Aniversariantes do Mês
              </CardTitle>
            </CardHeader>
            <CardContent>
              {birthdaysThisMonth.length > 0 ? (
                <div className="space-y-3 max-h-[200px] overflow-y-auto">
                  {birthdaysThisMonth.map((collab) => (
                    <div key={collab.id} className="flex items-center gap-3 p-2 rounded-lg bg-secondary/50">
                      <div className="w-10 h-10 rounded-full bg-pink-100 flex items-center justify-center">
                        <Cake className="w-5 h-5 text-pink-500" />
                      </div>
                      <div>
                        <p className="font-medium text-foreground">{collab.name}</p>
                        <p className="text-sm text-muted-foreground">
                          {collab.birth_date && format(parseISO(collab.birth_date), "dd 'de' MMMM", { locale: ptBR })}
                        </p>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="text-center py-8 text-muted-foreground">
                  <Cake className="w-12 h-12 mx-auto mb-2 opacity-30" />
                  <p>Nenhum aniversariante este mês.</p>
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      )}

      {/* Status Overview */}
      {hasAnyManagementPermission && collaborators.length > 0 && (
        <div className="grid sm:grid-cols-3 gap-4 animate-slide-up" style={{ animationDelay: "400ms" }}>
          <Card className="border border-border bg-green-50 dark:bg-green-950/20">
            <CardContent className="p-6 text-center">
              <p className="text-3xl font-bold text-green-600">{activeCollaborators}</p>
              <p className="text-sm text-green-700 dark:text-green-400">Colaboradores Ativos</p>
            </CardContent>
          </Card>
          <Card className="border border-border bg-red-50 dark:bg-red-950/20">
            <CardContent className="p-6 text-center">
              <p className="text-3xl font-bold text-red-600">{inactiveCollaborators}</p>
              <p className="text-sm text-red-700 dark:text-red-400">Colaboradores Inativos</p>
            </CardContent>
          </Card>
          <Card className="border border-border bg-blue-50 dark:bg-blue-950/20">
            <CardContent className="p-6 text-center">
              <p className="text-3xl font-bold text-blue-600">{benefits.length}</p>
              <p className="text-sm text-blue-700 dark:text-blue-400">Benefícios Ativos</p>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Getting Started (only if no collaborators) */}
      {(isAdmin || canViewModule("colaboradores")) && collaborators.length === 0 && (
        <Card className="border-2 border-dashed border-primary/30 bg-primary/5 animate-scale-in">
          <CardContent className="p-8 text-center">
            <div className="w-16 h-16 rounded-2xl bg-primary/10 flex items-center justify-center mx-auto mb-4">
              <Users className="w-8 h-8 text-primary" />
            </div>
            <h2 className="text-xl font-bold text-foreground mb-2">
              Comece a usar o SoftHome
            </h2>
            <p className="text-muted-foreground mb-6 max-w-md mx-auto">
              Cadastre seus colaboradores para desbloquear todos os recursos do sistema.
            </p>
            <Button variant="hero" size="lg" onClick={() => navigate("/dashboard/colaboradores")}>
              <UserPlus className="w-5 h-5 mr-2" />
              Cadastrar primeiro colaborador
            </Button>
          </CardContent>
        </Card>
      )}
    </div>
  );
};

export default DashboardHome;
