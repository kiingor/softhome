import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Building2, Users, CreditCard, AlertTriangle } from "lucide-react";

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

      return {
        totalCompanies: totalCompanies || 0,
        activeSubscriptions: activeSubscriptions || 0,
        blockedCompanies: blockedCompanies || 0,
        totalCollaborators: totalCollaborators || 0,
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

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-3xl font-bold text-foreground">Dashboard</h1>
        <p className="text-muted-foreground">Visão geral do sistema RH360</p>
      </div>

      {/* Stats cards */}
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
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Assinaturas Ativas
            </CardTitle>
            <CreditCard className="w-4 h-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold text-green-600">{stats?.activeSubscriptions || 0}</div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Empresas Bloqueadas
            </CardTitle>
            <AlertTriangle className="w-4 h-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold text-destructive">{stats?.blockedCompanies || 0}</div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Colaboradores Ativos
            </CardTitle>
            <Users className="w-4 h-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold">{stats?.totalCollaborators || 0}</div>
          </CardContent>
        </Card>
      </div>

      {/* Recent companies */}
      <Card>
        <CardHeader>
          <CardTitle>Empresas Recentes</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            {recentCompanies?.map((company) => (
              <div 
                key={company.id}
                className="flex items-center justify-between p-4 rounded-lg border border-border"
              >
                <div>
                  <h3 className="font-medium text-foreground">{company.company_name}</h3>
                  <p className="text-sm text-muted-foreground">
                    Plano: {company.plan_type} • 
                    {new Date(company.created_at).toLocaleDateString('pt-BR')}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  {company.is_blocked && (
                    <span className="px-2 py-1 text-xs rounded-full bg-destructive/10 text-destructive">
                      Bloqueado
                    </span>
                  )}
                  <span className={`px-2 py-1 text-xs rounded-full ${
                    company.subscription_status === 'active' 
                      ? 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400'
                      : 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400'
                  }`}>
                    {company.subscription_status}
                  </span>
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}