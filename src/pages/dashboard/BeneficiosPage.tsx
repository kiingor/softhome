import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useDashboard } from "@/contexts/DashboardContext";
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
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
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
import { Gift, Plus, Pencil, Trash2, UserPlus, Users } from "lucide-react";
import { toast } from "sonner";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import RoleGuard from "@/components/dashboard/RoleGuard";
import BenefitForm from "@/components/benefits/BenefitForm";
import BenefitAssignmentForm from "@/components/benefits/BenefitAssignmentForm";

type TabType = "benefits" | "assignments";

const BeneficiosPage = () => {
  const { currentCompany, hasAnyRole } = useDashboard();
  const queryClient = useQueryClient();
  const [activeTab, setActiveTab] = useState<TabType>("benefits");
  const [benefitFormOpen, setBenefitFormOpen] = useState(false);
  const [assignmentFormOpen, setAssignmentFormOpen] = useState(false);
  const [editingBenefit, setEditingBenefit] = useState<any>(null);
  const [deletingBenefit, setDeletingBenefit] = useState<any>(null);
  const [deletingAssignment, setDeletingAssignment] = useState<any>(null);
  const [collaboratorFilter, setCollaboratorFilter] = useState<string>("all");
  const [isSubmitting, setIsSubmitting] = useState(false);

  const canManage = hasAnyRole(["admin", "rh"]);

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

  // Fetch collaborators (non-temp)
  const { data: collaborators = [] } = useQuery({
    queryKey: ["collaborators-active", currentCompany?.id],
    queryFn: async () => {
      if (!currentCompany?.id) return [];
      const { data, error } = await supabase
        .from("collaborators")
        .select("id, name")
        .eq("company_id", currentCompany.id)
        .eq("status", "ativo")
        .eq("is_temp", false)
        .order("name");
      if (error) throw error;
      return data;
    },
    enabled: !!currentCompany?.id,
  });

  // Fetch assignments with benefit and collaborator details
  const { data: assignments = [], isLoading: loadingAssignments } = useQuery({
    queryKey: ["benefits-assignments", currentCompany?.id, collaboratorFilter],
    queryFn: async () => {
      if (!currentCompany?.id) return [];
      let query = supabase
        .from("benefits_assignments")
        .select(`
          *,
          benefit:benefits(id, name),
          collaborator:collaborators(id, name)
        `)
        .order("assigned_at", { ascending: false });

      if (collaboratorFilter && collaboratorFilter !== "all") {
        query = query.eq("collaborator_id", collaboratorFilter);
      }

      const { data, error } = await query;
      if (error) throw error;
      
      // Filter by company through benefit relationship
      return data.filter((a: any) => {
        const benefit = benefits.find((b) => b.id === a.benefit_id);
        return benefit?.company_id === currentCompany?.id;
      });
    },
    enabled: !!currentCompany?.id && benefits.length > 0,
  });

  // Create benefit mutation
  const createBenefit = useMutation({
    mutationFn: async (data: { name: string; description?: string }) => {
      const { error } = await supabase.from("benefits").insert({
        name: data.name,
        description: data.description || null,
        company_id: currentCompany!.id,
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
    mutationFn: async (data: { id: string; name: string; description?: string }) => {
      const { error } = await supabase
        .from("benefits")
        .update({ name: data.name, description: data.description || null })
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
      queryClient.invalidateQueries({ queryKey: ["benefits-assignments"] });
      setDeletingBenefit(null);
      toast.success("Benefício removido!");
    },
    onError: () => {
      toast.error("Erro ao remover benefício");
    },
  });

  // Create assignment mutation
  const createAssignment = useMutation({
    mutationFn: async (data: {
      benefit_id: string;
      collaborator_id: string;
      observation?: string;
    }) => {
      const { error } = await supabase.from("benefits_assignments").insert({
        benefit_id: data.benefit_id,
        collaborator_id: data.collaborator_id,
        observation: data.observation || null,
      });
      if (error) {
        if (error.code === "23505") {
          throw new Error("Este benefício já está atribuído a este colaborador");
        }
        throw error;
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["benefits-assignments"] });
      setAssignmentFormOpen(false);
      toast.success("Benefício atribuído com sucesso!");
    },
    onError: (error: Error) => {
      toast.error(error.message || "Erro ao atribuir benefício");
    },
  });

  // Delete assignment mutation
  const deleteAssignment = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from("benefits_assignments")
        .delete()
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["benefits-assignments"] });
      setDeletingAssignment(null);
      toast.success("Atribuição removida!");
    },
    onError: () => {
      toast.error("Erro ao remover atribuição");
    },
  });

  const handleBenefitSubmit = async (data: { name: string; description?: string }) => {
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

  const handleAssignmentSubmit = async (data: {
    benefit_id: string;
    collaborator_id: string;
    observation?: string;
  }) => {
    setIsSubmitting(true);
    try {
      await createAssignment.mutateAsync(data);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <RoleGuard allowedRoles={["admin", "rh", "colaborador"]}>
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-foreground">Benefícios</h1>
            <p className="text-muted-foreground">
              Gerencie os benefícios dos colaboradores
            </p>
          </div>
          {canManage && (
            <div className="flex gap-2">
              <Button
                variant="outline"
                onClick={() => setAssignmentFormOpen(true)}
                disabled={benefits.length === 0}
              >
                <UserPlus className="w-4 h-4 mr-2" />
                Atribuir
              </Button>
              <Button onClick={() => setBenefitFormOpen(true)}>
                <Plus className="w-4 h-4 mr-2" />
                Novo Benefício
              </Button>
            </div>
          )}
        </div>

        {/* Tabs */}
        <div className="flex gap-2 border-b">
          <button
            onClick={() => setActiveTab("benefits")}
            className={`px-4 py-2 font-medium transition-colors ${
              activeTab === "benefits"
                ? "border-b-2 border-primary text-primary"
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            <Gift className="w-4 h-4 inline-block mr-2" />
            Tipos de Benefício
          </button>
          <button
            onClick={() => setActiveTab("assignments")}
            className={`px-4 py-2 font-medium transition-colors ${
              activeTab === "assignments"
                ? "border-b-2 border-primary text-primary"
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            <Users className="w-4 h-4 inline-block mr-2" />
            Atribuições
          </button>
        </div>

        {/* Benefits Tab */}
        {activeTab === "benefits" && (
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Tipos de Benefício</CardTitle>
            </CardHeader>
            <CardContent>
              {loadingBenefits ? (
                <div className="text-center py-8 text-muted-foreground">
                  Carregando...
                </div>
              ) : benefits.length === 0 ? (
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
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Nome</TableHead>
                      <TableHead>Descrição</TableHead>
                      <TableHead className="text-center">Atribuições</TableHead>
                      {canManage && <TableHead className="w-[100px]">Ações</TableHead>}
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {benefits.map((benefit) => {
                      const assignmentCount = assignments.filter(
                        (a: any) => a.benefit_id === benefit.id
                      ).length;
                      return (
                        <TableRow key={benefit.id}>
                          <TableCell className="font-medium">
                            {benefit.name}
                          </TableCell>
                          <TableCell className="text-muted-foreground">
                            {benefit.description || "-"}
                          </TableCell>
                          <TableCell className="text-center">
                            <Badge variant="secondary">{assignmentCount}</Badge>
                          </TableCell>
                          {canManage && (
                            <TableCell>
                              <div className="flex gap-1">
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  onClick={() => setEditingBenefit(benefit)}
                                >
                                  <Pencil className="w-4 h-4" />
                                </Button>
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  onClick={() => setDeletingBenefit(benefit)}
                                >
                                  <Trash2 className="w-4 h-4 text-destructive" />
                                </Button>
                              </div>
                            </TableCell>
                          )}
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        )}

        {/* Assignments Tab */}
        {activeTab === "assignments" && (
          <Card>
            <CardHeader className="flex flex-row items-center justify-between">
              <CardTitle className="text-lg">Atribuições por Colaborador</CardTitle>
              <Select value={collaboratorFilter} onValueChange={setCollaboratorFilter}>
                <SelectTrigger className="w-[250px]">
                  <SelectValue placeholder="Filtrar por colaborador" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todos os colaboradores</SelectItem>
                  {collaborators.map((collab) => (
                    <SelectItem key={collab.id} value={collab.id}>
                      {collab.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </CardHeader>
            <CardContent>
              {loadingAssignments ? (
                <div className="text-center py-8 text-muted-foreground">
                  Carregando...
                </div>
              ) : assignments.length === 0 ? (
                <div className="text-center py-12">
                  <div className="w-16 h-16 rounded-full bg-muted flex items-center justify-center mx-auto mb-4">
                    <Users className="w-8 h-8 text-muted-foreground" />
                  </div>
                  <h3 className="font-medium text-foreground mb-2">
                    Nenhuma atribuição encontrada
                  </h3>
                  <p className="text-muted-foreground text-sm mb-4">
                    {benefits.length === 0
                      ? "Primeiro crie os tipos de benefícios"
                      : "Atribua benefícios aos colaboradores"}
                  </p>
                  {canManage && benefits.length > 0 && (
                    <Button onClick={() => setAssignmentFormOpen(true)}>
                      <UserPlus className="w-4 h-4 mr-2" />
                      Atribuir Benefício
                    </Button>
                  )}
                </div>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Colaborador</TableHead>
                      <TableHead>Benefício</TableHead>
                      <TableHead>Observação</TableHead>
                      <TableHead>Data Atribuição</TableHead>
                      {canManage && <TableHead className="w-[80px]">Ações</TableHead>}
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {assignments.map((assignment: any) => (
                      <TableRow key={assignment.id}>
                        <TableCell className="font-medium">
                          {assignment.collaborator?.name || "-"}
                        </TableCell>
                        <TableCell>
                          <Badge variant="outline">
                            {assignment.benefit?.name || "-"}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-muted-foreground">
                          {assignment.observation || "-"}
                        </TableCell>
                        <TableCell className="text-muted-foreground">
                          {format(new Date(assignment.assigned_at), "dd/MM/yyyy", {
                            locale: ptBR,
                          })}
                        </TableCell>
                        {canManage && (
                          <TableCell>
                            <Button
                              variant="ghost"
                              size="icon"
                              onClick={() => setDeletingAssignment(assignment)}
                            >
                              <Trash2 className="w-4 h-4 text-destructive" />
                            </Button>
                          </TableCell>
                        )}
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        )}

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
          initialData={editingBenefit}
          isLoading={isSubmitting}
        />

        {/* Assignment Form Modal */}
        <BenefitAssignmentForm
          open={assignmentFormOpen}
          onOpenChange={setAssignmentFormOpen}
          onSubmit={handleAssignmentSubmit}
          benefits={benefits}
          collaborators={collaborators}
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

        {/* Delete Assignment Dialog */}
        <AlertDialog
          open={!!deletingAssignment}
          onOpenChange={(open) => !open && setDeletingAssignment(null)}
        >
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Remover Atribuição</AlertDialogTitle>
              <AlertDialogDescription>
                Tem certeza que deseja remover este benefício do colaborador?
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancelar</AlertDialogCancel>
              <AlertDialogAction
                onClick={() => deleteAssignment.mutate(deletingAssignment.id)}
                className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              >
                Remover
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </div>
    </RoleGuard>
  );
};

export default BeneficiosPage;
