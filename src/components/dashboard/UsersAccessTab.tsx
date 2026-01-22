import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useDashboard } from "@/contexts/DashboardContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Plus, Trash2, Crown, Loader2, UserPlus } from "lucide-react";
import { toast } from "sonner";
import { MODULE_LABELS, type ModuleType } from "@/hooks/usePermissions";

interface CompanyUser {
  id: string;
  email: string;
  full_name: string | null;
  user_id: string | null;
  is_active: boolean;
  accepted_at: string | null;
}

interface UserPermission {
  module: string;
  can_view: boolean;
  can_create: boolean;
  can_edit: boolean;
  can_delete: boolean;
}

const MODULES: ModuleType[] = [
  "colaboradores",
  "setores",
  "cargos",
  "empresas",
  "beneficios",
  "ferias",
  "financeiro",
  "relatorios",
  "contabilidade",
];

export const UsersAccessTab = () => {
  const { currentCompany, user } = useDashboard();
  const queryClient = useQueryClient();
  const [isInviteOpen, setIsInviteOpen] = useState(false);
  const [selectedUser, setSelectedUser] = useState<CompanyUser | null>(null);
  const [userToDelete, setUserToDelete] = useState<CompanyUser | null>(null);
  const [inviteForm, setInviteForm] = useState({ email: "", full_name: "" });

  // Fetch company users
  const { data: companyUsers, isLoading: isLoadingUsers } = useQuery({
    queryKey: ["company-users", currentCompany?.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("company_users")
        .select("*")
        .eq("company_id", currentCompany!.id)
        .order("created_at", { ascending: false });

      if (error) throw error;
      return data as CompanyUser[];
    },
    enabled: !!currentCompany?.id,
  });

  // Fetch permissions for selected user
  const { data: userPermissions, isLoading: isLoadingPermissions } = useQuery({
    queryKey: ["user-permissions", selectedUser?.user_id, currentCompany?.id],
    queryFn: async () => {
      if (!selectedUser?.user_id) return [];

      const { data, error } = await supabase
        .from("user_permissions")
        .select("*")
        .eq("user_id", selectedUser.user_id)
        .eq("company_id", currentCompany!.id);

      if (error) throw error;
      return data as UserPermission[];
    },
    enabled: !!selectedUser?.user_id && !!currentCompany?.id,
  });

  // Invite user mutation
  const inviteMutation = useMutation({
    mutationFn: async (data: { email: string; full_name: string }) => {
      // 1. Inserir na tabela company_users
      const { error } = await supabase.from("company_users").insert({
        company_id: currentCompany!.id,
        email: data.email,
        full_name: data.full_name,
        invited_by: user!.id,
      });

      if (error) throw error;

      // 2. Enviar email de convite via Edge Function
      try {
        const { error: emailError } = await supabase.functions.invoke("send-invite-email", {
          body: {
            recipientEmail: data.email,
            recipientName: data.full_name,
            companyName: currentCompany!.company_name,
            inviterName: user?.email || "Administrador",
          },
        });

        if (emailError) {
          console.error("Error sending invite email:", emailError);
          // Não falha a operação se o email não for enviado
          // O convite foi salvo na tabela
        }
      } catch (emailError) {
        console.error("Error invoking send-invite-email:", emailError);
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["company-users"] });
      toast.success("Convite enviado com sucesso!");
      setIsInviteOpen(false);
      setInviteForm({ email: "", full_name: "" });
    },
    onError: (error: any) => {
      console.error("Error inviting user:", error);
      if (error.code === "23505") {
        toast.error("Este email já foi convidado.");
      } else {
        toast.error("Erro ao enviar convite.");
      }
    },
  });

  // Delete user mutation
  const deleteMutation = useMutation({
    mutationFn: async (userId: string) => {
      const { error } = await supabase
        .from("company_users")
        .delete()
        .eq("id", userId);

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["company-users"] });
      toast.success("Usuário removido com sucesso!");
      setUserToDelete(null);
      if (selectedUser?.id === userToDelete?.id) {
        setSelectedUser(null);
      }
    },
    onError: () => {
      toast.error("Erro ao remover usuário.");
    },
  });

  // Update permission mutation
  const updatePermissionMutation = useMutation({
    mutationFn: async ({
      module,
      permission,
      value,
    }: {
      module: string;
      permission: "can_view" | "can_create" | "can_edit" | "can_delete";
      value: boolean;
    }) => {
      if (!selectedUser?.user_id) throw new Error("User not accepted yet");

      // First try to update existing
      const { data: existing } = await supabase
        .from("user_permissions")
        .select("id")
        .eq("user_id", selectedUser.user_id)
        .eq("company_id", currentCompany!.id)
        .eq("module", module)
        .maybeSingle();

      if (existing) {
        const { error } = await supabase
          .from("user_permissions")
          .update({ [permission]: value, updated_at: new Date().toISOString() })
          .eq("id", existing.id);

        if (error) throw error;
      } else {
        // Insert new permission record
        const { error } = await supabase.from("user_permissions").insert({
          user_id: selectedUser.user_id,
          company_id: currentCompany!.id,
          module,
          [permission]: value,
        });

        if (error) throw error;
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["user-permissions"] });
    },
    onError: () => {
      toast.error("Erro ao atualizar permissão.");
    },
  });

  const getPermissionValue = (module: string, permission: keyof UserPermission) => {
    const perm = userPermissions?.find((p) => p.module === module);
    return perm?.[permission] ?? false;
  };

  const handlePermissionChange = (
    module: string,
    permission: "can_view" | "can_create" | "can_edit" | "can_delete",
    value: boolean
  ) => {
    updatePermissionMutation.mutate({ module, permission, value });
  };

  return (
    <div className="space-y-6">
      {/* Users List Card */}
      <Card>
        <CardHeader className="pb-4">
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="text-lg">Usuários da Empresa</CardTitle>
              <CardDescription>
                Gerencie os usuários que têm acesso ao sistema
              </CardDescription>
            </div>
            <Dialog open={isInviteOpen} onOpenChange={setIsInviteOpen}>
              <DialogTrigger asChild>
                <Button size="sm">
                  <UserPlus className="w-4 h-4 mr-2" />
                  Convidar Usuário
                </Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>Convidar Novo Usuário</DialogTitle>
                  <DialogDescription>
                    Envie um convite para um novo usuário acessar o sistema.
                  </DialogDescription>
                </DialogHeader>
                <div className="space-y-4 py-4">
                  <div className="space-y-2">
                    <Label htmlFor="email">Email</Label>
                    <Input
                      id="email"
                      type="email"
                      placeholder="usuario@empresa.com"
                      value={inviteForm.email}
                      onChange={(e) =>
                        setInviteForm({ ...inviteForm, email: e.target.value })
                      }
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="name">Nome Completo</Label>
                    <Input
                      id="name"
                      placeholder="Nome do usuário"
                      value={inviteForm.full_name}
                      onChange={(e) =>
                        setInviteForm({ ...inviteForm, full_name: e.target.value })
                      }
                    />
                  </div>
                </div>
                <DialogFooter>
                  <Button variant="outline" onClick={() => setIsInviteOpen(false)}>
                    Cancelar
                  </Button>
                  <Button
                    onClick={() => inviteMutation.mutate(inviteForm)}
                    disabled={!inviteForm.email || inviteMutation.isPending}
                  >
                    {inviteMutation.isPending ? (
                      <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                    ) : (
                      <Plus className="w-4 h-4 mr-2" />
                    )}
                    Enviar Convite
                  </Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>
          </div>
        </CardHeader>
        <CardContent>
          {isLoadingUsers ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
            </div>
          ) : companyUsers?.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              Nenhum usuário convidado ainda. Clique em "Convidar Usuário" para adicionar.
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Nome</TableHead>
                  <TableHead>Email</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="w-[100px]">Ações</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {companyUsers?.map((companyUser) => (
                  <TableRow
                    key={companyUser.id}
                    className={`cursor-pointer ${
                      selectedUser?.id === companyUser.id ? "bg-muted" : ""
                    }`}
                    onClick={() => setSelectedUser(companyUser)}
                  >
                    <TableCell className="font-medium">
                      {companyUser.full_name || "-"}
                    </TableCell>
                    <TableCell>{companyUser.email}</TableCell>
                    <TableCell>
                      {companyUser.accepted_at ? (
                        <Badge variant="default" className="bg-green-500">
                          Ativo
                        </Badge>
                      ) : (
                        <Badge variant="secondary">Pendente</Badge>
                      )}
                    </TableCell>
                    <TableCell>
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={(e) => {
                          e.stopPropagation();
                          setUserToDelete(companyUser);
                        }}
                      >
                        <Trash2 className="w-4 h-4 text-destructive" />
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {/* Permissions Card */}
      {selectedUser && (
        <Card>
          <CardHeader className="pb-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center">
                <span className="text-primary font-semibold">
                  {(selectedUser.full_name || selectedUser.email)[0].toUpperCase()}
                </span>
              </div>
              <div>
                <CardTitle className="text-lg">
                  Permissões de {selectedUser.full_name || selectedUser.email}
                </CardTitle>
                <CardDescription>
                  {selectedUser.accepted_at
                    ? "Configure o que este usuário pode fazer em cada módulo"
                    : "Este usuário ainda não aceitou o convite"}
                </CardDescription>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            {!selectedUser.accepted_at ? (
              <div className="text-center py-8 text-muted-foreground">
                As permissões só podem ser configuradas após o usuário aceitar o convite.
              </div>
            ) : isLoadingPermissions ? (
              <div className="flex items-center justify-center py-8">
                <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
              </div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Módulo</TableHead>
                    <TableHead className="text-center w-24">Visualizar</TableHead>
                    <TableHead className="text-center w-24">Criar</TableHead>
                    <TableHead className="text-center w-24">Editar</TableHead>
                    <TableHead className="text-center w-24">Excluir</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {MODULES.map((module) => (
                    <TableRow key={module}>
                      <TableCell className="font-medium">
                        {MODULE_LABELS[module]}
                      </TableCell>
                      <TableCell className="text-center">
                        <Checkbox
                          checked={getPermissionValue(module, "can_view") as boolean}
                          onCheckedChange={(checked) =>
                            handlePermissionChange(module, "can_view", !!checked)
                          }
                        />
                      </TableCell>
                      <TableCell className="text-center">
                        <Checkbox
                          checked={getPermissionValue(module, "can_create") as boolean}
                          onCheckedChange={(checked) =>
                            handlePermissionChange(module, "can_create", !!checked)
                          }
                        />
                      </TableCell>
                      <TableCell className="text-center">
                        <Checkbox
                          checked={getPermissionValue(module, "can_edit") as boolean}
                          onCheckedChange={(checked) =>
                            handlePermissionChange(module, "can_edit", !!checked)
                          }
                        />
                      </TableCell>
                      <TableCell className="text-center">
                        <Checkbox
                          checked={getPermissionValue(module, "can_delete") as boolean}
                          onCheckedChange={(checked) =>
                            handlePermissionChange(module, "can_delete", !!checked)
                          }
                        />
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>
      )}

      {/* Delete Confirmation Dialog */}
      <AlertDialog open={!!userToDelete} onOpenChange={() => setUserToDelete(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remover Usuário</AlertDialogTitle>
            <AlertDialogDescription>
              Tem certeza que deseja remover{" "}
              <strong>{userToDelete?.full_name || userToDelete?.email}</strong>? Esta
              ação não pode ser desfeita.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => userToDelete && deleteMutation.mutate(userToDelete.id)}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Remover
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
};
