import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { 
  Table, 
  TableBody, 
  TableCell, 
  TableHead, 
  TableHeader, 
  TableRow 
} from "@/components/ui/table";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { PLANS, PlanId, getSubscriptionStatusLabel } from "@/lib/planUtils";
import { useMaster } from "@/contexts/MasterContext";
import { Search, Lock, Unlock, ArrowUpCircle, ArrowDownCircle, Ban, RefreshCw } from "lucide-react";

interface CompanyWithDetails {
  id: string;
  company_name: string;
  plan_type: string;
  subscription_status: string | null;
  is_blocked: boolean | null;
  created_at: string;
  asaas_customer_id: string | null;
  asaas_subscription_id: string | null;
  active_collaborators: number;
}

export default function MasterEmpresasPage() {
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedCompany, setSelectedCompany] = useState<CompanyWithDetails | null>(null);
  const [actionType, setActionType] = useState<'upgrade' | 'block' | 'cancel' | null>(null);
  const [newPlan, setNewPlan] = useState<PlanId>('essencial');
  const { toast } = useToast();
  const { userId } = useMaster();
  const queryClient = useQueryClient();

  const { data: companies, isLoading } = useQuery({
    queryKey: ['master-companies', searchTerm],
    queryFn: async () => {
      let query = supabase
        .from('companies')
        .select(`
          id,
          company_name,
          plan_type,
          subscription_status,
          is_blocked,
          created_at,
          asaas_customer_id,
          asaas_subscription_id
        `)
        .order('created_at', { ascending: false });

      if (searchTerm) {
        query = query.ilike('company_name', `%${searchTerm}%`);
      }

      const { data, error } = await query;
      if (error) throw error;

      // Get collaborator counts for each company
      const companiesWithCounts = await Promise.all(
        data.map(async (company) => {
          const { count } = await supabase
            .from('collaborators')
            .select('*', { count: 'exact', head: true })
            .eq('company_id', company.id)
            .eq('status', 'ativo');

          return {
            ...company,
            active_collaborators: count || 0,
          };
        })
      );

      return companiesWithCounts as CompanyWithDetails[];
    },
  });

  const blockMutation = useMutation({
    mutationFn: async ({ companyId, blocked }: { companyId: string; blocked: boolean }) => {
      const { data, error } = await supabase.functions.invoke('asaas', {
        body: {
          action: 'block_company',
          companyId,
          blocked,
          changedBy: userId,
        },
      });

      if (error) throw error;
      return data;
    },
    onSuccess: (_, variables) => {
      toast({
        title: variables.blocked ? 'Empresa bloqueada' : 'Empresa desbloqueada',
        description: 'A alteração foi aplicada com sucesso.',
      });
      queryClient.invalidateQueries({ queryKey: ['master-companies'] });
      setSelectedCompany(null);
      setActionType(null);
    },
    onError: (error: Error) => {
      toast({
        title: 'Erro',
        description: error.message,
        variant: 'destructive',
      });
    },
  });

  const changePlanMutation = useMutation({
    mutationFn: async ({ companyId, newPlan, previousPlan, subscriptionId }: { 
      companyId: string; 
      newPlan: string; 
      previousPlan: string;
      subscriptionId: string | null;
    }) => {
      if (subscriptionId) {
        // If has Asaas subscription, update via API
        const { data, error } = await supabase.functions.invoke('asaas', {
          body: {
            action: 'update_plan',
            subscriptionId,
            newPlan,
            companyId,
            changedBy: userId,
            previousPlan,
          },
        });

        if (error) throw error;
        return data;
      } else {
        // Just update locally
        const { error } = await supabase
          .from('companies')
          .update({ plan_type: newPlan })
          .eq('id', companyId);

        if (error) throw error;

        await supabase
          .from('subscription_history')
          .insert({
            company_id: companyId,
            previous_plan: previousPlan,
            new_plan: newPlan,
            changed_by: userId,
            change_reason: 'Manual plan change by master admin',
          });

        return { success: true };
      }
    },
    onSuccess: () => {
      toast({
        title: 'Plano alterado',
        description: 'O plano foi atualizado com sucesso.',
      });
      queryClient.invalidateQueries({ queryKey: ['master-companies'] });
      setSelectedCompany(null);
      setActionType(null);
    },
    onError: (error: Error) => {
      toast({
        title: 'Erro ao alterar plano',
        description: error.message,
        variant: 'destructive',
      });
    },
  });

  const cancelMutation = useMutation({
    mutationFn: async ({ companyId, subscriptionId }: { companyId: string; subscriptionId: string }) => {
      const { data, error } = await supabase.functions.invoke('asaas', {
        body: {
          action: 'cancel_subscription',
          subscriptionId,
          companyId,
          changedBy: userId,
        },
      });

      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      toast({
        title: 'Assinatura cancelada',
        description: 'A assinatura foi cancelada e a empresa foi bloqueada.',
      });
      queryClient.invalidateQueries({ queryKey: ['master-companies'] });
      setSelectedCompany(null);
      setActionType(null);
    },
    onError: (error: Error) => {
      toast({
        title: 'Erro ao cancelar',
        description: error.message,
        variant: 'destructive',
      });
    },
  });

  function handleAction() {
    if (!selectedCompany) return;

    switch (actionType) {
      case 'block':
        blockMutation.mutate({
          companyId: selectedCompany.id,
          blocked: !selectedCompany.is_blocked,
        });
        break;
      case 'upgrade':
        changePlanMutation.mutate({
          companyId: selectedCompany.id,
          newPlan,
          previousPlan: selectedCompany.plan_type,
          subscriptionId: selectedCompany.asaas_subscription_id,
        });
        break;
      case 'cancel':
        if (selectedCompany.asaas_subscription_id) {
          cancelMutation.mutate({
            companyId: selectedCompany.id,
            subscriptionId: selectedCompany.asaas_subscription_id,
          });
        }
        break;
    }
  }

  function getPlanLimit(planType: string): number {
    const plan = PLANS[planType as PlanId];
    return plan?.collaboratorLimit || 5;
  }

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-3xl font-bold text-foreground">Empresas</h1>
        <p className="text-muted-foreground">Gerencie todas as empresas cadastradas no RH360</p>
      </div>

      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle>Lista de Empresas</CardTitle>
            <div className="relative w-72">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <Input
                placeholder="Buscar empresa..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="pl-9"
              />
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Empresa</TableHead>
                <TableHead>Plano</TableHead>
                <TableHead>Colaboradores</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Criada em</TableHead>
                <TableHead className="text-right">Ações</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                <TableRow>
                  <TableCell colSpan={6} className="text-center py-8">
                    Carregando...
                  </TableCell>
                </TableRow>
              ) : companies?.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={6} className="text-center py-8 text-muted-foreground">
                    Nenhuma empresa encontrada
                  </TableCell>
                </TableRow>
              ) : (
                companies?.map((company) => {
                  const planLimit = getPlanLimit(company.plan_type);
                  const isOverLimit = company.active_collaborators >= planLimit;
                  const statusInfo = getSubscriptionStatusLabel(company.subscription_status || 'active');
                  
                  return (
                    <TableRow key={company.id}>
                      <TableCell>
                        <div>
                          <p className="font-medium">{company.company_name}</p>
                          {company.asaas_customer_id && (
                            <p className="text-xs text-muted-foreground">
                              Asaas: {company.asaas_customer_id}
                            </p>
                          )}
                        </div>
                      </TableCell>
                      <TableCell>
                        <Badge variant="outline">
                          {PLANS[company.plan_type as PlanId]?.name || company.plan_type}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <span className={isOverLimit ? 'text-destructive font-medium' : ''}>
                          {company.active_collaborators} / {planLimit}
                        </span>
                        {isOverLimit && (
                          <span className="ml-2 text-xs text-destructive">
                            (limite atingido)
                          </span>
                        )}
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-2">
                          <Badge variant={statusInfo.variant}>
                            {statusInfo.label}
                          </Badge>
                          {company.is_blocked && (
                            <Badge variant="destructive">Bloqueado</Badge>
                          )}
                        </div>
                      </TableCell>
                      <TableCell>
                        {new Date(company.created_at).toLocaleDateString('pt-BR')}
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex items-center justify-end gap-2">
                          <Button
                            variant="ghost"
                            size="icon"
                            title="Alterar plano"
                            onClick={() => {
                              setSelectedCompany(company);
                              setNewPlan(company.plan_type as PlanId);
                              setActionType('upgrade');
                            }}
                          >
                            <ArrowUpCircle className="w-4 h-4" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            title={company.is_blocked ? 'Desbloquear' : 'Bloquear'}
                            onClick={() => {
                              setSelectedCompany(company);
                              setActionType('block');
                            }}
                          >
                            {company.is_blocked ? (
                              <Unlock className="w-4 h-4" />
                            ) : (
                              <Lock className="w-4 h-4" />
                            )}
                          </Button>
                          {company.asaas_subscription_id && (
                            <Button
                              variant="ghost"
                              size="icon"
                              title="Cancelar assinatura"
                              onClick={() => {
                                setSelectedCompany(company);
                                setActionType('cancel');
                              }}
                            >
                              <Ban className="w-4 h-4 text-destructive" />
                            </Button>
                          )}
                        </div>
                      </TableCell>
                    </TableRow>
                  );
                })
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {/* Action Dialog */}
      <Dialog open={!!actionType && !!selectedCompany} onOpenChange={() => {
        setActionType(null);
        setSelectedCompany(null);
      }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {actionType === 'upgrade' && 'Alterar Plano'}
              {actionType === 'block' && (selectedCompany?.is_blocked ? 'Desbloquear Empresa' : 'Bloquear Empresa')}
              {actionType === 'cancel' && 'Cancelar Assinatura'}
            </DialogTitle>
            <DialogDescription>
              {actionType === 'upgrade' && `Alterar o plano da empresa "${selectedCompany?.company_name}"`}
              {actionType === 'block' && (
                selectedCompany?.is_blocked 
                  ? `Desbloquear o acesso da empresa "${selectedCompany?.company_name}"?`
                  : `Bloquear o acesso da empresa "${selectedCompany?.company_name}"? Os dados serão preservados.`
              )}
              {actionType === 'cancel' && `Cancelar a assinatura da empresa "${selectedCompany?.company_name}"? A empresa será bloqueada.`}
            </DialogDescription>
          </DialogHeader>

          {actionType === 'upgrade' && (
            <div className="py-4">
              <label className="text-sm font-medium mb-2 block">Novo plano</label>
              <Select value={newPlan} onValueChange={(v) => setNewPlan(v as PlanId)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {Object.entries(PLANS).map(([id, plan]) => (
                    <SelectItem key={id} value={id}>
                      {plan.name} - R$ {plan.priceDisplay}/mês (até {plan.collaboratorLimit} colab.)
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

          <DialogFooter>
            <Button variant="outline" onClick={() => {
              setActionType(null);
              setSelectedCompany(null);
            }}>
              Cancelar
            </Button>
            <Button 
              variant={actionType === 'cancel' || (actionType === 'block' && !selectedCompany?.is_blocked) ? 'destructive' : 'default'}
              onClick={handleAction}
              disabled={blockMutation.isPending || changePlanMutation.isPending || cancelMutation.isPending}
            >
              {blockMutation.isPending || changePlanMutation.isPending || cancelMutation.isPending ? (
                <>
                  <RefreshCw className="w-4 h-4 mr-2 animate-spin" />
                  Processando...
                </>
              ) : (
                'Confirmar'
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}