import { useDashboard } from "@/contexts/DashboardContext";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  Users,
  Calendar,
  FileText,
  DollarSign,
  TrendingUp,
  Clock,
  UserPlus,
  AlertCircle,
} from "lucide-react";
import { useNavigate } from "react-router-dom";

const DashboardHome = () => {
  const { profile, roles, currentCompany, hasRole, hasAnyRole } = useDashboard();
  const navigate = useNavigate();

  const isAdmin = hasRole("admin");
  const isRH = hasRole("rh");
  const isGestor = hasRole("gestor");
  const isColaborador = hasRole("colaborador") && !hasAnyRole(["admin", "rh", "gestor"]);

  // Stats cards based on role
  const adminStats = [
    { label: "Colaboradores", value: "0", icon: Users, color: "bg-primary/10 text-primary", change: "+0%" },
    { label: "Férias Pendentes", value: "0", icon: Calendar, color: "bg-accent/10 text-accent", change: "0" },
    { label: "Lançamentos do Mês", value: "R$ 0", icon: DollarSign, color: "bg-green-100 text-green-600", change: "+0%" },
    { label: "Documentos Vencendo", value: "0", icon: FileText, color: "bg-orange-100 text-orange-600", change: "0" },
  ];

  const colaboradorStats = [
    { label: "Dias de Férias", value: "30", icon: Calendar, color: "bg-accent/10 text-accent" },
    { label: "Próximo Pagamento", value: "5 dias", icon: Clock, color: "bg-primary/10 text-primary" },
    { label: "Documentos Pendentes", value: "0", icon: FileText, color: "bg-orange-100 text-orange-600" },
  ];

  const stats = isColaborador ? colaboradorStats : adminStats;

  const quickActions = isColaborador
    ? [
        { label: "Solicitar Férias", icon: Calendar, action: () => navigate("/dashboard/ferias") },
        { label: "Meus Documentos", icon: FileText, action: () => navigate("/dashboard/documentos") },
        { label: "Meus Benefícios", icon: DollarSign, action: () => navigate("/dashboard/beneficios") },
      ]
    : [
        { label: "Novo Colaborador", icon: UserPlus, action: () => navigate("/dashboard/colaboradores") },
        { label: "Aprovar Férias", icon: Calendar, action: () => navigate("/dashboard/ferias") },
        { label: "Lançamentos", icon: DollarSign, action: () => navigate("/dashboard/lancamentos") },
        { label: "Relatórios", icon: TrendingUp, action: () => navigate("/dashboard/relatorios") },
      ];

  return (
    <div className="space-y-8">
      {/* Welcome Section */}
      <div>
        <h1 className="text-2xl md:text-3xl font-bold text-foreground">
          Olá{profile?.full_name ? `, ${profile.full_name.split(" ")[0]}` : ""}! 👋
        </h1>
        <p className="text-muted-foreground mt-1">
          {isColaborador
            ? "Acompanhe suas informações e solicitações."
            : `Aqui está o resumo de ${currentCompany?.company_name || "sua empresa"} hoje.`}
        </p>
      </div>

      {/* Stats Grid */}
      <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {stats.map((stat, index) => (
          <Card key={index} className="border border-border hover:shadow-soft transition-shadow">
            <CardContent className="p-6">
              <div className="flex items-start justify-between">
                <div>
                  <p className="text-sm text-muted-foreground mb-1">{stat.label}</p>
                  <p className="text-2xl font-bold text-foreground">{stat.value}</p>
                  {"change" in stat && (
                    <p className="text-xs text-muted-foreground mt-1">
                      <span className="text-accent">{String((stat as any).change)}</span> vs mês anterior
                    </p>
                  )}
                </div>
                <div className={`w-12 h-12 rounded-xl ${stat.color} flex items-center justify-center`}>
                  <stat.icon className="w-6 h-6" />
                </div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Quick Actions */}
      <div>
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

      {/* Pending Items (Admin/RH view) */}
      {hasAnyRole(["admin", "rh", "gestor"]) && (
        <div className="grid lg:grid-cols-2 gap-6">
          <Card className="border border-border">
            <CardHeader>
              <CardTitle className="text-lg flex items-center gap-2">
                <AlertCircle className="w-5 h-5 text-orange-500" />
                Pendências
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-center py-8 text-muted-foreground">
                <p>Nenhuma pendência no momento.</p>
                <p className="text-sm mt-1">Cadastre colaboradores para começar.</p>
              </div>
            </CardContent>
          </Card>

          <Card className="border border-border">
            <CardHeader>
              <CardTitle className="text-lg flex items-center gap-2">
                <Calendar className="w-5 h-5 text-accent" />
                Próximos Eventos
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-center py-8 text-muted-foreground">
                <p>Nenhum evento próximo.</p>
                <p className="text-sm mt-1">Aniversários e férias aparecerão aqui.</p>
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Getting Started (if no data) */}
      {hasAnyRole(["admin", "rh"]) && (
        <Card className="border-2 border-dashed border-primary/30 bg-primary/5">
          <CardContent className="p-8 text-center">
            <div className="w-16 h-16 rounded-2xl bg-primary/10 flex items-center justify-center mx-auto mb-4">
              <Users className="w-8 h-8 text-primary" />
            </div>
            <h2 className="text-xl font-bold text-foreground mb-2">
              Comece a usar o RH360
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
