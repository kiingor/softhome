import { useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
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
import { 
  ArrowLeft, 
  Building2, 
  Users, 
  CreditCard, 
  Lock, 
  Unlock, 
  Send, 
  RefreshCw,
  ArrowUpCircle,
  Ban,
  Calendar,
  Mail,
  MapPin,
  Phone
} from "lucide-react";

export default function MasterCompanyDetailsPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { toast } = useToast();
  const { userId } = useMaster();
  const queryClient = useQueryClient();

  const [showPlanDialog, setShowPlanDialog] = useState(false);
  const [showBlockDialog, setShowBlockDialog] = useState(false);
  const [showMessageDialog, setShowMessageDialog] = useState(false);
  const [newPlan, setNewPlan] = useState<PlanId>('essencial');
  const [messageTitle, setMessageTitle] = useState("");
  const [messageBody, setMessageBody] = useState("");
  const [messageType, setMessageType] = useState<'info' | 'warning' | 'alert'>('info');

  // Fetch company details
  const { data: company, isLoading } = useQuery({
    queryKey: ['master-company', id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('companies')
        .select('*')
        .eq('id', id)
        .single();

      if (error) throw error;
      return data;
    },
    enabled: !!id,
  });

  // Fetch collaborators
  const { data: collaborators } = useQuery({
    queryKey: ['master-company-collaborators', id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('collaborators')
        .select(`
          id,
          name,
          email,
          cpf,
          position,
          status,
          store_id,
          stores(store_name)
        `)
        .eq('company_id', id)
        .order('name');

      if (error) throw error;
      return data;
    },
    enabled: !!id,
  });

  // Fetch stores
  const { data: stores } = useQuery({
    queryKey: ['master-company-stores', id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('stores')
        .select('id, store_name, store_code, address')
        .eq('company_id', id)
        .order('store_name');

      if (error) throw error;
      return data;
    },
    enabled: !!id,
  });

  // Fetch subscription history
  const { data: history } = useQuery({
    queryKey: ['master-company-history', id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('subscription_history')
        .select('*')
        .eq('company_id', id)
        .order('created_at', { ascending: false })
        .limit(10);

      if (error) throw error;
      return data;
    },
    enabled: !!id,
  });

  // Block/Unblock mutation
  const blockMutation = useMutation({
    mutationFn: async (blocked: boolean) => {
      const { error } = await supabase
        .from('companies')
        .update({ is_blocked: blocked })
        .eq('id', id);

      if (error) throw error;
    },
    onSuccess: (_, blocked) => {
      toast({
        title: blocked ? 'Empresa bloqueada' : 'Empresa desbloqueada',
        description: 'A alteração foi aplicada com sucesso.',
      });
      queryClient.invalidateQueries({ queryKey: ['master-company', id] });
      setShowBlockDialog(false);
    },
    onError: (error: Error) => {
      toast({
        title: 'Erro',
        description: error.message,
        variant: 'destructive',
      });
    },
  });

  // Change plan mutation
  const changePlanMutation = useMutation({
    mutationFn: async (plan: string) => {
      // Update company
      const { error: updateError } = await supabase
        .from('companies')
        .update({ plan_type: plan })
        .eq('id', id);

      if (updateError) throw updateError;

      // Record history
      const { error: historyError } = await supabase
        .from('subscription_history')
        .insert({
          company_id: id,
          previous_plan: company?.plan_type,
          new_plan: plan,
          changed_by: userId,
          change_reason: 'Manual change by master admin',
        });

      if (historyError) throw historyError;
    },
    onSuccess: () => {
      toast({
        title: 'Plano alterado',
        description: 'O plano foi atualizado com sucesso.',
      });
      queryClient.invalidateQueries({ queryKey: ['master-company', id] });
      queryClient.invalidateQueries({ queryKey: ['master-company-history', id] });
      setShowPlanDialog(false);
    },
    onError: (error: Error) => {
      toast({
        title: 'Erro ao alterar plano',
        description: error.message,
        variant: 'destructive',
      });
    },
  });

  // Send message mutation
  const sendMessageMutation = useMutation({
    mutationFn: async () => {
      const { error } = await supabase
        .from('system_messages')
        .insert({
          company_id: id,
          title: messageTitle,
          body: messageBody,
          message_type: messageType,
          created_by: userId,
          visible_until: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(), // 7 days
        });

      if (error) throw error;
    },
    onSuccess: () => {
      toast({
        title: 'Mensagem enviada',
        description: 'A mensagem foi enviada para o painel do cliente.',
      });
      setShowMessageDialog(false);
      setMessageTitle("");
      setMessageBody("");
      setMessageType('info');
    },
    onError: (error: Error) => {
      toast({
        title: 'Erro ao enviar mensagem',
        description: error.message,
        variant: 'destructive',
      });
    },
  });

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <RefreshCw className="w-8 h-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!company) {
    return (
      <div className="text-center py-12">
        <p className="text-muted-foreground">Empresa não encontrada</p>
        <Button variant="link" onClick={() => navigate('/master/empresas')}>
          Voltar para lista
        </Button>
      </div>
    );
  }

  const planInfo = PLANS[company.plan_type as PlanId] || PLANS.essencial;
  const statusInfo = getSubscriptionStatusLabel(company.subscription_status || 'active');
  const activeCollaborators = collaborators?.filter(c => c.status === 'ativo').length || 0;

  return (
    <div className="space-y-8">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="icon" onClick={() => navigate('/master/empresas')}>
            <ArrowLeft className="w-5 h-5" />
          </Button>
          <div>
            <div className="flex items-center gap-3">
              <h1 className="text-3xl font-bold text-foreground">{company.company_name}</h1>
              {company.is_blocked && (
                <Badge variant="destructive">Bloqueado</Badge>
              )}
            </div>
            <p className="text-muted-foreground">
              Cliente desde {new Date(company.created_at).toLocaleDateString('pt-BR')}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" onClick={() => setShowMessageDialog(true)}>
            <Send className="w-4 h-4 mr-2" />
            Enviar Mensagem
          </Button>
          <Button
            variant={company.is_blocked ? "default" : "destructive"}
            onClick={() => setShowBlockDialog(true)}
          >
            {company.is_blocked ? (
              <>
                <Unlock className="w-4 h-4 mr-2" />
                Desbloquear
              </>
            ) : (
              <>
                <Lock className="w-4 h-4 mr-2" />
                Bloquear
              </>
            )}
          </Button>
        </div>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
              <CreditCard className="w-4 h-4" />
              Plano Atual
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xl font-bold">{planInfo.name}</p>
                <p className="text-sm text-muted-foreground">R$ {planInfo.priceDisplay}/mês</p>
              </div>
              <Button variant="ghost" size="sm" onClick={() => {
                setNewPlan(company.plan_type as PlanId);
                setShowPlanDialog(true);
              }}>
                <ArrowUpCircle className="w-4 h-4" />
              </Button>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
              <Users className="w-4 h-4" />
              Colaboradores
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-xl font-bold">
              {activeCollaborators} / {planInfo.collaboratorLimit}
            </p>
            <p className="text-sm text-muted-foreground">
              {planInfo.collaboratorLimit - activeCollaborators} slots disponíveis
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
              <Building2 className="w-4 h-4" />
              Lojas
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-xl font-bold">{stores?.length || 0}</p>
            <p className="text-sm text-muted-foreground">unidades cadastradas</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
              <Calendar className="w-4 h-4" />
              Status
            </CardTitle>
          </CardHeader>
          <CardContent>
            <Badge variant={statusInfo.variant} className="text-sm">
              {statusInfo.label}
            </Badge>
            {company.subscription_due_date && (
              <p className="text-sm text-muted-foreground mt-1">
                Próx. cobrança: {new Date(company.subscription_due_date).toLocaleDateString('pt-BR')}
              </p>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Main Content */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Collaborators Table */}
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle>Colaboradores ({collaborators?.length || 0})</CardTitle>
            <CardDescription>Lista completa de colaboradores da empresa</CardDescription>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Nome</TableHead>
                  <TableHead>Cargo</TableHead>
                  <TableHead>Loja</TableHead>
                  <TableHead>Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {collaborators?.map((collab) => (
                  <TableRow key={collab.id}>
                    <TableCell>
                      <div>
                        <p className="font-medium">{collab.name}</p>
                        <p className="text-xs text-muted-foreground">{collab.email}</p>
                      </div>
                    </TableCell>
                    <TableCell>{collab.position || '-'}</TableCell>
                    <TableCell>{collab.stores?.store_name || '-'}</TableCell>
                    <TableCell>
                      <Badge variant={collab.status === 'ativo' ? 'default' : 'secondary'}>
                        {collab.status}
                      </Badge>
                    </TableCell>
                  </TableRow>
                ))}
                {!collaborators?.length && (
                  <TableRow>
                    <TableCell colSpan={4} className="text-center text-muted-foreground py-8">
                      Nenhum colaborador cadastrado
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </CardContent>
        </Card>

        {/* Sidebar */}
        <div className="space-y-6">
          {/* Stores */}
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Lojas</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                {stores?.map((store) => (
                  <div key={store.id} className="p-3 rounded-lg border border-border">
                    <p className="font-medium">{store.store_name}</p>
                    {store.store_code && (
                      <p className="text-xs text-muted-foreground">Código: {store.store_code}</p>
                    )}
                    {store.address && (
                      <p className="text-xs text-muted-foreground flex items-center gap-1 mt-1">
                        <MapPin className="w-3 h-3" />
                        {store.address}
                      </p>
                    )}
                  </div>
                ))}
                {!stores?.length && (
                  <p className="text-center text-muted-foreground py-4">
                    Nenhuma loja cadastrada
                  </p>
                )}
              </div>
            </CardContent>
          </Card>

          {/* History */}
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Histórico de Planos</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                {history?.map((h) => (
                  <div key={h.id} className="flex items-center justify-between text-sm">
                    <div>
                      <p className="text-muted-foreground">
                        {h.previous_plan || 'Início'} → {h.new_plan}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {new Date(h.created_at).toLocaleDateString('pt-BR')}
                      </p>
                    </div>
                  </div>
                ))}
                {!history?.length && (
                  <p className="text-center text-muted-foreground py-4">
                    Sem histórico de alterações
                  </p>
                )}
              </div>
            </CardContent>
          </Card>
        </div>
      </div>

      {/* Change Plan Dialog */}
      <Dialog open={showPlanDialog} onOpenChange={setShowPlanDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Alterar Plano</DialogTitle>
            <DialogDescription>
              Selecione o novo plano para {company.company_name}
            </DialogDescription>
          </DialogHeader>
          <div className="py-4">
            <Label>Novo plano</Label>
            <Select value={newPlan} onValueChange={(v) => setNewPlan(v as PlanId)}>
              <SelectTrigger className="mt-2">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {Object.entries(PLANS).map(([id, plan]) => (
                  <SelectItem key={id} value={id}>
                    {plan.name} - R$ {plan.priceDisplay}/mês
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowPlanDialog(false)}>
              Cancelar
            </Button>
            <Button 
              onClick={() => changePlanMutation.mutate(newPlan)}
              disabled={changePlanMutation.isPending}
            >
              {changePlanMutation.isPending ? 'Alterando...' : 'Confirmar'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Block Dialog */}
      <Dialog open={showBlockDialog} onOpenChange={setShowBlockDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {company.is_blocked ? 'Desbloquear Empresa' : 'Bloquear Empresa'}
            </DialogTitle>
            <DialogDescription>
              {company.is_blocked 
                ? `Desbloquear o acesso da empresa "${company.company_name}"?`
                : `Bloquear o acesso da empresa "${company.company_name}"? Os dados serão preservados.`
              }
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowBlockDialog(false)}>
              Cancelar
            </Button>
            <Button 
              variant={company.is_blocked ? 'default' : 'destructive'}
              onClick={() => blockMutation.mutate(!company.is_blocked)}
              disabled={blockMutation.isPending}
            >
              {blockMutation.isPending ? 'Processando...' : 'Confirmar'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Send Message Dialog */}
      <Dialog open={showMessageDialog} onOpenChange={setShowMessageDialog}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Enviar Mensagem</DialogTitle>
            <DialogDescription>
              Enviar uma notificação para o painel do cliente
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label>Tipo de mensagem</Label>
              <Select value={messageType} onValueChange={(v) => setMessageType(v as any)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="info">Informação</SelectItem>
                  <SelectItem value="warning">Aviso</SelectItem>
                  <SelectItem value="alert">Alerta</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Título</Label>
              <Input 
                placeholder="Título da mensagem"
                value={messageTitle}
                onChange={(e) => setMessageTitle(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label>Mensagem</Label>
              <Textarea 
                placeholder="Conteúdo da mensagem..."
                value={messageBody}
                onChange={(e) => setMessageBody(e.target.value)}
                rows={4}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowMessageDialog(false)}>
              Cancelar
            </Button>
            <Button 
              onClick={() => sendMessageMutation.mutate()}
              disabled={sendMessageMutation.isPending || !messageTitle || !messageBody}
            >
              {sendMessageMutation.isPending ? (
                <>
                  <RefreshCw className="w-4 h-4 mr-2 animate-spin" />
                  Enviando...
                </>
              ) : (
                <>
                  <Send className="w-4 h-4 mr-2" />
                  Enviar
                </>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}