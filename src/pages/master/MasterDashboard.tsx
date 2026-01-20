import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Building2, Users, CreditCard, AlertTriangle, TrendingUp, CheckCircle, Clock } from "lucide-react";
import { PLANS, PlanId } from "@/lib/planUtils";
import { Link } from "react-router-dom";
import { differenceInDays } from "date-fns";

export default function MasterDashboard() {
  const { data: stats } = useQuery({
    queryKey: ['master-stats'],
    queryFn: async () => {
      // Get total companies
      const { count: totalCompanies } = await supabase
        .from('companies')
        .select('*', { count: 'exact', head: true });

      // Get active subscriptions
      const { count: activeSubscriptions } = await supabase
        .from('companies')
        .select('*', { count: 'exact', head: true })
        .eq('subscription_status', 'active');

      // Get blocked companies
      const { count: blockedCompanies } = await supabase
        .from('companies')
        .select('*', { count: 'exact', head: true })
        .eq('is_blocked', true);

      // Get total collaborators
      const { count: totalCollaborators } = await supabase
        .from('collaborators')
        .select('*', { count: 'exact', head: true })
        .eq('status', 'ativo');

      // Get companies by plan
      const { data: planDistribution } = await supabase
        .from('companies')
        .select('plan_type');

      const planCounts: Record<string, number> = {};
      planDistribution?.forEach((c) => {
        const plan = c.plan_type || 'essencial';
        planCounts[plan] = (planCounts[plan] || 0) + 1;
      });

      // Get subscription status distribution
      const { data: statusDistribution } = await supabase
        .from('companies')
        .select('subscription_status');

      const statusCounts: Record<string, number> = {};
      statusDistribution?.forEach((c) => {
        const status = c.subscription_status || 'active';
        statusCounts[status] = (statusCounts[status] || 0) + 1;
      });

      return {
        totalCompanies: totalCompanies || 0,
        activeSubscriptions: activeSubscriptions || 0,
        blockedCompanies: blockedCompanies || 0,
        totalCollaborators: totalCollaborators || 0,
        planCounts,
        statusCounts,
      };
    },
  });

  // Get recent companies
  const { data: recentCompanies } = useQuery({
    queryKey: ['master-recent-companies'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('companies')
        .select('id, company_name, plan_type, subscription_status, is_blocked, created_at')
        .order('created_at', { ascending: false })
        .limit(5);

      if (error) throw error;
      return data;
    },
  });

  // Get recent messages
  const { data: recentMessages } = useQuery({
    queryKey: ['master-recent-messages'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('system_messages')
        .select(`
          id,
          title,
          message_type,
          created_at,
          is_read,
          company_id
        `)
        .order('created_at', { ascending: false })
        .limit(5);

      if (error) throw error;
      return data;
    },
  });

  // Get trial companies
  const { data: trialCompanies } = useQuery({
    queryKey: ['master-trial-companies'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('companies')
        .select('id, company_name, trial_ends_at, plan_type, created_at')
        .not('trial_ends_at', 'is', null)
        .gt('trial_ends_at', new Date().toISOString())
        .order('trial_ends_at', { ascending: true });

      if (error) throw error;
      return data;
    },
  });

  // Calculate MRR (Monthly Recurring Revenue)
  const mrr = stats?.planCounts ? Object.entries(stats.planCounts).reduce((acc, [plan, count]) => {
    const planInfo = PLANS[plan as PlanId];
    return acc + (planInfo?.price || 0) * count;
  }, 0) : 0;

  const getDaysRemaining = (trialEndsAt: string) => {
    return differenceInDays(new Date(trialEndsAt), new Date());
  };

  const getTrialBadgeVariant = (days: number) => {
    if (days <= 1) return "destructive";
    if (days <= 2) return "secondary";
    return "outline";
  };

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-3xl font-bold text-foreground">Dashboard</h1>
        <p className="text-muted-foreground">Visão geral do sistema RH360</p>
      </div>

      {/* Main Stats */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Total de Empresas
            </CardTitle>
            <Building2 className="w-4 h-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold">{stats?.totalCompanies || 0}</div>
            <p className="text-xs text-muted-foreground mt-1">
              {stats?.blockedCompanies || 0} bloqueadas
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Assinaturas Ativas
            </CardTitle>
            <CheckCircle className="w-4 h-4 text-green-500" />
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold text-green-600">{stats?.activeSubscriptions || 0}</div>
            <p className="text-xs text-muted-foreground mt-1">
              {((stats?.activeSubscriptions || 0) / (stats?.totalCompanies || 1) * 100).toFixed(0)}% do total
            </p>
          </CardContent>
        </Card>

        <Card className="bg-gradient-to-br from-orange-50 to-amber-50 dark:from-orange-950/30 dark:to-amber-950/30 border-orange-200 dark:border-orange-800">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-orange-700 dark:text-orange-300">
              Em Trial
            </CardTitle>
            <Clock className="w-4 h-4 text-orange-600" />
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold text-orange-700 dark:text-orange-300">
              {trialCompanies?.length || 0}
            </div>
            <p className="text-xs text-orange-600 dark:text-orange-400 mt-1">
              Empresas em período de teste
            </p>
          </CardContent>
        </Card>

        <Card className="bg-gradient-to-br from-green-50 to-emerald-50 dark:from-green-950/30 dark:to-emerald-950/30 border-green-200 dark:border-green-800">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-green-700 dark:text-green-300">
              MRR Estimado
            </CardTitle>
            <TrendingUp className="w-4 h-4 text-green-600" />
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold text-green-700 dark:text-green-300">
              R$ {mrr.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
            </div>
            <p className="text-xs text-green-600 dark:text-green-400 mt-1">
              Receita mensal recorrente
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Trial Companies */}
      {trialCompanies && trialCompanies.length > 0 && (
        <Card className="border-orange-200 dark:border-orange-800">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Clock className="w-5 h-5 text-orange-500" />
              Empresas em Trial
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {trialCompanies.map((company) => {
                const daysRemaining = getDaysRemaining(company.trial_ends_at!);
                return (
                  <Link
                    key={company.id}
                    to={`/master/empresas/${company.id}`}
                    className="flex items-center justify-between p-3 rounded-lg border border-border hover:bg-muted/50 transition-colors"
                  >
                    <div>
                      <p className="font-medium text-foreground">{company.company_name}</p>
                      <p className="text-xs text-muted-foreground">
                        Criada em {new Date(company.created_at).toLocaleDateString('pt-BR')}
                      </p>
                    </div>
                    <div className="flex items-center gap-2">
                      <Badge variant="outline" className="text-xs">
                        {PLANS[company.plan_type as PlanId]?.name || company.plan_type}
                      </Badge>
                      <Badge variant={getTrialBadgeVariant(daysRemaining)} className="text-xs">
                        {daysRemaining <= 0 ? 'Expira hoje' : `${daysRemaining} dia${daysRemaining > 1 ? 's' : ''} restante${daysRemaining > 1 ? 's' : ''}`}
                      </Badge>
                    </div>
                  </Link>
                );
              })}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Distribution Cards */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Plan Distribution */}
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Distribuição por Plano</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              {Object.entries(PLANS).map(([planId, plan]) => {
                const count = stats?.planCounts?.[planId] || 0;
                const percentage = stats?.totalCompanies 
                  ? (count / stats.totalCompanies * 100).toFixed(0) 
                  : 0;
                
                return (
                  <div key={planId} className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <div className={`w-3 h-3 rounded-full ${
                        planId === 'essencial' ? 'bg-emerald-500' :
                        planId === 'crescer' ? 'bg-blue-500' :
                        planId === 'profissional' ? 'bg-violet-500' :
                        'bg-amber-500'
                      }`} />
                      <span className="text-sm font-medium">{plan.name}</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="text-sm text-muted-foreground">{count} empresas</span>
                      <Badge variant="outline">{percentage}%</Badge>
                    </div>
                  </div>
                );
              })}
            </div>
          </CardContent>
        </Card>

        {/* Status Distribution */}
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Status das Assinaturas</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              {[
                { key: 'active', label: 'Ativas', color: 'bg-green-500' },
                { key: 'pending', label: 'Pendentes', color: 'bg-yellow-500' },
                { key: 'overdue', label: 'Em atraso', color: 'bg-orange-500' },
                { key: 'cancelled', label: 'Canceladas', color: 'bg-red-500' },
              ].map((status) => {
                const count = stats?.statusCounts?.[status.key] || 0;
                const percentage = stats?.totalCompanies 
                  ? (count / stats.totalCompanies * 100).toFixed(0) 
                  : 0;
                
                return (
                  <div key={status.key} className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <div className={`w-3 h-3 rounded-full ${status.color}`} />
                      <span className="text-sm font-medium">{status.label}</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="text-sm text-muted-foreground">{count}</span>
                      <Badge variant="outline">{percentage}%</Badge>
                    </div>
                  </div>
                );
              })}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Recent Activity */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Recent Companies */}
        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle>Empresas Recentes</CardTitle>
            <Link to="/master/empresas" className="text-sm text-primary hover:underline">
              Ver todas
            </Link>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              {recentCompanies?.map((company) => (
                <Link
                  key={company.id}
                  to={`/master/empresas/${company.id}`}
                  className="flex items-center justify-between p-3 rounded-lg border border-border hover:bg-muted/50 transition-colors"
                >
                  <div>
                    <p className="font-medium text-foreground">{company.company_name}</p>
                    <p className="text-xs text-muted-foreground">
                      {new Date(company.created_at).toLocaleDateString('pt-BR')}
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    {company.is_blocked && (
                      <Badge variant="destructive" className="text-xs">Bloqueado</Badge>
                    )}
                    <Badge variant="outline" className="text-xs">
                      {PLANS[company.plan_type as PlanId]?.name || company.plan_type}
                    </Badge>
                  </div>
                </Link>
              ))}
              {!recentCompanies?.length && (
                <p className="text-center text-muted-foreground py-4">
                  Nenhuma empresa cadastrada
                </p>
              )}
            </div>
          </CardContent>
        </Card>

        {/* Recent Messages */}
        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle>Mensagens Enviadas</CardTitle>
            <Link to="/master/mensagens" className="text-sm text-primary hover:underline">
              Ver todas
            </Link>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              {recentMessages?.map((message) => (
                <div
                  key={message.id}
                  className="flex items-center justify-between p-3 rounded-lg border border-border"
                >
                  <div>
                    <p className="font-medium text-foreground">{message.title}</p>
                    <p className="text-xs text-muted-foreground">
                      {new Date(message.created_at).toLocaleDateString('pt-BR', {
                        day: '2-digit',
                        month: '2-digit',
                        hour: '2-digit',
                        minute: '2-digit',
                      })}
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <Badge 
                      variant={message.message_type === 'alert' ? 'destructive' : 
                               message.message_type === 'warning' ? 'secondary' : 'outline'}
                      className="text-xs"
                    >
                      {message.message_type}
                    </Badge>
                    {message.is_read && (
                      <CheckCircle className="w-4 h-4 text-green-500" />
                    )}
                  </div>
                </div>
              ))}
              {!recentMessages?.length && (
                <p className="text-center text-muted-foreground py-4">
                  Nenhuma mensagem enviada
                </p>
              )}
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}