import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useDashboard } from "@/contexts/DashboardContext";
import { usePermissions } from "@/hooks/usePermissions";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Gift, Plus, Pencil, Trash as Trash2, DotsThreeVertical, MagnifyingGlass } from "@phosphor-icons/react";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";
import PermissionGuard from "@/components/dashboard/PermissionGuard";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import BenefitForm, { BENEFIT_CATEGORY_LABELS, type BenefitCategory } from "@/components/benefits/BenefitForm";
import { formatCurrency, toTitleCase } from "@/lib/formatters";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";

const BeneficiosPage = () => {
  const { currentCompany } = useDashboard();
  const queryClient = useQueryClient();
  const [benefitFormOpen, setBenefitFormOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [editingBenefit, setEditingBenefit] = useState<any>(null);
  const [deletingBenefit, setDeletingBenefit] = useState<any>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const { canCreate, canEdit, canDelete, isAdmin } = usePermissions("beneficios");
  const canManage = canCreate || canEdit || canDelete || isAdmin;

  // Fetch benefits
  const { data: benefits = [], isLoading: loadingBenefits } = useQuery({
    queryKey: ["benefits", currentCompany?.id],
    queryFn: async () => {
      if (!currentCompany?.id) return [];
      const { data, error } = await supabase
        .from("benefits")
        .select("*")
        .eq("company_id", currentCompany.id)
        .order("name");
      if (error) throw error;
      return data;
    },
    enabled: !!currentCompany?.id,
  });

  const filteredBenefits = benefits.filter((b: any) => {
    if (!searchQuery.trim()) return true;
    const q = searchQuery.toLowerCase();
    return (
      (b.name || "").toLowerCase().includes(q) ||
      (b.description || "").toLowerCase().includes(q) ||
      (BENEFIT_CATEGORY_LABELS[b.category as BenefitCategory] || "").toLowerCase().includes(q)
    );
  });

  // Fetch assignments com nomes dos colaboradores (pra mostrar no hover)
  const { data: assignmentsByBenefit = {} } = useQuery({
    queryKey: ["benefits-assignments-by-benefit", currentCompany?.id],
    queryFn: async () => {
      if (!currentCompany?.id || benefits.length === 0) return {};
      const { data, error } = await supabase
        .from("benefits_assignments")
        .select("benefit_id, collaborator:collaborators(full_name)");
      if (error) throw error;

      const byBenefit: Record<string, string[]> = {};
      (data as unknown as Array<{ benefit_id: string; collaborator: { full_name: string } | null }>).forEach((a) => {
        const name = a.collaborator?.full_name;
        if (!name) return;
        if (!byBenefit[a.benefit_id]) byBenefit[a.benefit_id] = [];
        byBenefit[a.benefit_id].push(toTitleCase(name));
      });
      // Ordena alfabeticamente pra facilitar leitura
      for (const id of Object.keys(byBenefit)) byBenefit[id].sort();
      return byBenefit;
    },
    enabled: !!currentCompany?.id && benefits.length > 0,
  });

  // Create benefit mutation
  const createBenefit = useMutation({
    mutationFn: async (data: {
      name: string;
      description?: string;
      value: number;
      value_type: "monthly" | "daily";
      category: BenefitCategory;
      applicable_days: string[];
      is_company_expense: boolean;
    }) => {
      const { error } = await supabase.from("benefits").insert({
        name: data.name,
        description: data.description || null,
        value: data.value,
        value_type: data.value_type,
        category: data.category,
        applicable_days: data.applicable_days,
        company_id: currentCompany!.id,
        is_company_expense: data.is_company_expense,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["benefits"] });
      setBenefitFormOpen(false);
      toast.success("Benefício criado com sucesso!");
    },
    onError: () => {
      toast.error("Erro ao criar benefício");
    },
  });

  // Update benefit mutation
  const updateBenefit = useMutation({
    mutationFn: async (data: {
      id: string;
      name: string;
      description?: string;
      value: number;
      value_type: "monthly" | "daily";
      category: BenefitCategory;
      applicable_days: string[];
      is_company_expense: boolean;
    }) => {
      const { error } = await supabase
        .from("benefits")
        .update({
          name: data.name,
          description: data.description || null,
          value: data.value,
          value_type: data.value_type,
          category: data.category,
          applicable_days: data.applicable_days,
          is_company_expense: data.is_company_expense,
        })
        .eq("id", data.id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["benefits"] });
      setEditingBenefit(null);
      toast.success("Benefício atualizado!");
    },
    onError: () => {
      toast.error("Erro ao atualizar benefício");
    },
  });

  // Delete benefit mutation
  const deleteBenefit = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("benefits").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["benefits"] });
      queryClient.invalidateQueries({ queryKey: ["benefits-assignments-by-benefit"] });
      setDeletingBenefit(null);
      toast.success("Benefício removido!");
    },
    onError: () => {
      toast.error("Erro ao remover benefício");
    },
  });

  const handleBenefitSubmit = async (data: {
    name: string;
    description?: string;
    value: number;
    value_type: "monthly" | "daily";
    category: BenefitCategory;
    applicable_days: string[];
    is_company_expense: boolean;
  }) => {
    setIsSubmitting(true);
    try {
      if (editingBenefit) {
        await updateBenefit.mutateAsync({ id: editingBenefit.id, ...data });
      } else {
        await createBenefit.mutateAsync(data);
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  const getValueTypeLabel = (type: string) => {
    return type === "monthly" ? "Mensal" : "Diário";
  };

  return (
    <PermissionGuard module="beneficios">
      <div className="space-y-6 page-content">
        <div className="flex items-center justify-between animate-fade-in">
          <div>
            <h1 className="text-2xl font-bold text-foreground">Benefícios</h1>
            <p className="text-muted-foreground">
              Cadastre os tipos de benefícios da empresa
            </p>
          </div>
          {canManage && (
            <Button onClick={() => setBenefitFormOpen(true)}>
              <Plus className="w-4 h-4 mr-2" />
              Novo Benefício
            </Button>
          )}
        </div>

        <Card>
          <CardHeader>
            <div className="flex items-center justify-between gap-4">
              <div>
                <CardTitle className="text-lg">Tipos de Benefício</CardTitle>
                <p className="text-sm text-muted-foreground mt-1">
                  {filteredBenefits.length} de {benefits.length} benefício(s)
                </p>
              </div>
              <div className="relative">
                <MagnifyingGlass className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Buscar por nome ou categoria..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="pl-8 w-64"
                />
              </div>
            </div>
          </CardHeader>
          <CardContent>
            {loadingBenefits ? (
              <div className="text-center py-8 text-muted-foreground">
                Carregando...
              </div>
            ) : filteredBenefits.length === 0 && !searchQuery.trim() ? (
              <div className="text-center py-12">
                <div className="w-16 h-16 rounded-full bg-muted flex items-center justify-center mx-auto mb-4">
                  <Gift className="w-8 h-8 text-muted-foreground" />
                </div>
                <h3 className="font-medium text-foreground mb-2">
                  Nenhum benefício cadastrado
                </h3>
                <p className="text-muted-foreground text-sm mb-4">
                  Comece criando os tipos de benefícios da empresa
                </p>
                {canManage && (
                  <Button onClick={() => setBenefitFormOpen(true)}>
                    <Plus className="w-4 h-4 mr-2" />
                    Criar Benefício
                  </Button>
                )}
              </div>
            ) : filteredBenefits.length === 0 ? (
              <div className="text-center py-12 text-muted-foreground">
                <Gift className="w-12 h-12 mx-auto mb-4 opacity-50" />
                <p>Nenhum benefício encontrado</p>
                <p className="text-sm">Tente outro termo de busca</p>
              </div>
            ) : (
              <TooltipProvider delayDuration={150}>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Nome</TableHead>
                      <TableHead>Categoria</TableHead>
                      {/* Descrição oculta em telas menores — reaparece a partir de lg */}
                      <TableHead className="hidden lg:table-cell">Descrição</TableHead>
                      <TableHead className="text-right">Valor</TableHead>
                      <TableHead>Tipo</TableHead>
                      <TableHead className="text-center">Atribuições</TableHead>
                      {canManage && <TableHead className="w-[100px]">Ações</TableHead>}
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredBenefits.map((benefit: any) => {
                      const assignees = assignmentsByBenefit[benefit.id] ?? [];
                      const assignmentCount = assignees.length;
                      return (
                        <TableRow key={benefit.id}>
                          <TableCell className="font-medium">
                            {toTitleCase(benefit.name)}
                          </TableCell>
                          <TableCell>
                            <Badge variant="outline" className="text-xs">
                              {BENEFIT_CATEGORY_LABELS[(benefit.category ?? "other") as BenefitCategory]}
                            </Badge>
                          </TableCell>
                          <TableCell className="hidden lg:table-cell text-muted-foreground max-w-[200px] truncate">
                            {benefit.description || "-"}
                          </TableCell>
                          <TableCell className="text-right font-mono">
                            {formatCurrency(benefit.value || 0)}
                          </TableCell>
                          <TableCell>
                            <Badge variant={benefit.value_type === "monthly" ? "default" : "secondary"}>
                              {getValueTypeLabel(benefit.value_type)}
                            </Badge>
                          </TableCell>
                          <TableCell className="text-center">
                            {assignmentCount === 0 ? (
                              <Badge variant="outline">0</Badge>
                            ) : (
                              <Tooltip>
                                <TooltipTrigger asChild>
                                  <Badge variant="outline" className="cursor-help">
                                    {assignmentCount}
                                  </Badge>
                                </TooltipTrigger>
                                <TooltipContent side="left" className="max-w-xs">
                                  <div className="text-xs font-medium mb-1">
                                    {assignmentCount === 1 ? "1 colaborador" : `${assignmentCount} colaboradores`}
                                  </div>
                                  <ul className="text-xs space-y-0.5 max-h-60 overflow-y-auto">
                                    {assignees.map((name) => (
                                      <li key={name}>{name}</li>
                                    ))}
                                  </ul>
                                </TooltipContent>
                              </Tooltip>
                            )}
                          </TableCell>
                          {canManage && (
                            <TableCell>
                              <DropdownMenu>
                                <DropdownMenuTrigger asChild>
                                  <Button variant="ghost" size="icon" className="h-8 w-8">
                                    <DotsThreeVertical className="h-4 w-4" />
                                  </Button>
                                </DropdownMenuTrigger>
                                <DropdownMenuContent align="end">
                                  <DropdownMenuItem onClick={() => setEditingBenefit(benefit)}>
                                    <Pencil className="w-4 h-4 mr-2" />
                                    Editar
                                  </DropdownMenuItem>
                                  <DropdownMenuSeparator />
                                  <DropdownMenuItem
                                    className="text-destructive focus:text-destructive"
                                    onClick={() => setDeletingBenefit(benefit)}
                                  >
                                    <Trash2 className="w-4 h-4 mr-2" />
                                    Excluir
                                  </DropdownMenuItem>
                                </DropdownMenuContent>
                              </DropdownMenu>
                            </TableCell>
                          )}
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </TooltipProvider>
            )}
          </CardContent>
        </Card>

        {/* Info Card */}
        <Card className="bg-muted/50 border-dashed">
          <CardContent className="p-4">
            <p className="text-sm text-muted-foreground">
              <strong>Dica:</strong> A atribuição de benefícios aos colaboradores é feita diretamente na tela de edição do colaborador. 
              Acesse "Colaboradores" no menu, clique em "Editar" e atribua os benefícios desejados no painel de custos.
            </p>
          </CardContent>
        </Card>

        {/* Benefit Form Modal */}
        <BenefitForm
          open={benefitFormOpen || !!editingBenefit}
          onOpenChange={(open) => {
            if (!open) {
              setBenefitFormOpen(false);
              setEditingBenefit(null);
            }
          }}
          onSubmit={handleBenefitSubmit}
          initialData={editingBenefit ? {
            name: editingBenefit.name,
            description: editingBenefit.description,
            value: editingBenefit.value || 0,
            value_type: editingBenefit.value_type || "monthly",
            category: (editingBenefit.category ?? "other") as BenefitCategory,
            applicable_days: editingBenefit.applicable_days || ["mon", "tue", "wed", "thu", "fri"],
            is_company_expense: editingBenefit.is_company_expense ?? true,
          } : undefined}
          isLoading={isSubmitting}
        />

        {/* Delete Benefit Dialog */}
        <AlertDialog
          open={!!deletingBenefit}
          onOpenChange={(open) => !open && setDeletingBenefit(null)}
        >
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Remover Benefício</AlertDialogTitle>
              <AlertDialogDescription>
                Tem certeza que deseja remover o benefício "{deletingBenefit?.name}"?
                Todas as atribuições relacionadas também serão removidas.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancelar</AlertDialogCancel>
              <AlertDialogAction
                onClick={() => deleteBenefit.mutate(deletingBenefit.id)}
                className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              >
                Remover
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </div>
    </PermissionGuard>
  );
};

export default BeneficiosPage;
