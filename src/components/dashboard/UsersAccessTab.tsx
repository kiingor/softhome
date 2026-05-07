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
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Plus,
  Trash as Trash2,
  CircleNotch as Loader2,
  UserPlus,
  Envelope as Mail,
  Eye,
  EyeSlash as EyeOff,
  ShieldCheck,
  DotsThree as MoreHorizontal,
  LockKey,
  WarningCircle,
} from "@phosphor-icons/react";
import { toast } from "sonner";
import {
  ALL_MODULES,
  MODULE_GROUPS,
  MODULE_LABELS,
  type ModuleType,
  usePermissions,
} from "@/hooks/usePermissions";
import { Switch } from "@/components/ui/switch";

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

const MODULES: ModuleType[] = ALL_MODULES;

export const UsersAccessTab = () => {
  const { currentCompany, user } = useDashboard();
  const queryClient = useQueryClient();
  const { canView: canViewPermissions, canEdit: canEditPermissions, isAdmin } = usePermissions("permissoes");
  const [isInviteOpen, setIsInviteOpen] = useState(false);
  const [selectedUser, setSelectedUser] = useState<CompanyUser | null>(null);
  const [permissionsDialogOpen, setPermissionsDialogOpen] = useState(false);
  const [userToDelete, setUserToDelete] = useState<CompanyUser | null>(null);
  const [inviteForm, setInviteForm] = useState({ 
    email: "", 
    full_name: "", 
    password: "", 
    confirmPassword: "" 
  });
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);

  // Resend access data state
  const [resendUser, setResendUser] = useState<CompanyUser | null>(null);
  const [resendPassword, setResendPassword] = useState("");
  const [resendConfirmPassword, setResendConfirmPassword] = useState("");
  const [showResendPassword, setShowResendPassword] = useState(false);

  // Fetch company users — exclui colaboradores (eles acessam pelo Portal,
  // não pelo dashboard). Aqui ficam só os usuários cadastrados via Configurações
  // + o owner da empresa (que pode não estar em company_users).
  const { data: companyUsers, isLoading: isLoadingUsers } = useQuery({
    queryKey: ["company-users", currentCompany?.id, user?.id],
    queryFn: async () => {
      const [usersRes, collabsRes, companyRes] = await Promise.all([
        supabase
          .from("company_users")
          .select("*")
          .eq("company_id", currentCompany!.id)
          .order("created_at", { ascending: false }),
        supabase
          .from("collaborators")
          .select("user_id")
          .eq("company_id", currentCompany!.id)
          .not("user_id", "is", null),
        supabase
          .from("companies")
          .select("owner_id")
          .eq("id", currentCompany!.id)
          .maybeSingle(),
      ]);

      if (usersRes.error) throw usersRes.error;
      if (collabsRes.error) throw collabsRes.error;

      const collabUserIds = new Set(
        (collabsRes.data ?? [])
          .map((c) => (c as { user_id: string | null }).user_id)
          .filter((id): id is string => !!id),
      );

      const filtered = (usersRes.data as CompanyUser[]).filter(
        (u) => !u.user_id || !collabUserIds.has(u.user_id),
      );

      // Garante que o owner da empresa apareça mesmo se não estiver em company_users
      const ownerId = (companyRes.data as { owner_id: string | null } | null)
        ?.owner_id;
      const ownerInList = ownerId
        ? filtered.some((u) => u.user_id === ownerId)
        : true;

      if (ownerId && !ownerInList) {
        // Busca dados do owner via profiles (full_name); email vem do auth
        // context se for o próprio admin logado
        const { data: ownerProfile } = await supabase
          .from("profiles")
          .select("full_name")
          .eq("user_id", ownerId)
          .maybeSingle();

        const ownerEmail =
          user?.id === ownerId ? user?.email ?? "" : "";

        const ownerEntry: CompanyUser = {
          id: `owner:${ownerId}`,
          email: ownerEmail || "(sem email cadastrado)",
          full_name:
            (ownerProfile as { full_name: string | null } | null)?.full_name ??
            null,
          user_id: ownerId,
          is_active: true,
          accepted_at: null,
        };
        filtered.unshift(ownerEntry);
      }

      return filtered;
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

  // Create user mutation (new flow with password)
  const inviteMutation = useMutation({
    mutationFn: async (data: { email: string; full_name: string; password: string }) => {
      // 1. Criar usuário via Edge Function (backend com service role)
      const { data: createResult, error: createError } = await supabase.functions.invoke("create-collaborator-user", {
        body: {
          email: data.email,
          password: data.password,
          full_name: data.full_name,
          company_id: currentCompany!.id,
        },
      });

      if (createError) {
        console.error("Error creating user:", createError);
        throw new Error(createError.message || "Erro ao criar usuário");
      }

      if (!createResult?.success) {
        throw new Error(createResult?.error || "Erro ao criar usuário");
      }

      // 2. Enviar email com credenciais de acesso
      try {
        const { error: emailError } = await supabase.functions.invoke("send-invite-email", {
          body: {
            recipientEmail: data.email,
            recipientName: data.full_name,
            recipientPassword: data.password,
            companyName: currentCompany!.company_name,
            inviterName: user?.email || "Administrador",
          },
        });

        if (emailError) {
          console.error("Error sending credentials email:", emailError);
        }
      } catch (emailError) {
        console.error("Error invoking send-invite-email:", emailError);
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["company-users"] });
      toast.success("Usuário criado com sucesso! Credenciais enviadas por email.");
      setIsInviteOpen(false);
      setInviteForm({ email: "", full_name: "", password: "", confirmPassword: "" });
    },
    onError: (error: any) => {
      console.error("Error creating user:", error);
      const message = error.message || "Erro ao criar usuário.";
      if (message.includes("already registered") || message.includes("já existe")) {
        toast.error("Este email já está cadastrado no sistema.");
      } else {
        toast.error(message);
      }
    },
  });

  // Resend access data mutation
  const resendMutation = useMutation({
    mutationFn: async (data: { userId: string; email: string; fullName: string; newPassword: string }) => {
      // 1. Atualizar senha via Edge Function
      const { data: updateResult, error: updateError } = await supabase.functions.invoke("update-user-password", {
        body: {
          user_id: data.userId,
          new_password: data.newPassword,
        },
      });

      if (updateError) {
        console.error("Error updating password:", updateError);
        throw new Error(updateError.message || "Erro ao atualizar senha");
      }

      if (!updateResult?.success) {
        throw new Error(updateResult?.error || "Erro ao atualizar senha");
      }

      // 2. Reenviar email com novas credenciais
      const { error: emailError } = await supabase.functions.invoke("send-invite-email", {
        body: {
          recipientEmail: data.email,
          recipientName: data.fullName,
          recipientPassword: data.newPassword,
          companyName: currentCompany!.company_name,
          inviterName: user?.email || "Administrador",
        },
      });

      if (emailError) {
        console.error("Error sending credentials email:", emailError);
        throw new Error("Senha atualizada, mas erro ao enviar email");
      }
    },
    onSuccess: () => {
      toast.success("Dados de acesso reenviados com sucesso!");
      setResendUser(null);
      setResendPassword("");
      setResendConfirmPassword("");
    },
    onError: (error: any) => {
      toast.error(error.message || "Erro ao reenviar dados de acesso.");
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

  // Batch update all permissions (for "Mark as Admin" toggle)
  const batchUpdatePermissionsMutation = useMutation({
    mutationFn: async ({ grantAll }: { grantAll: boolean }) => {
      if (!selectedUser?.user_id) throw new Error("User not accepted yet");

      // Delete all existing permissions for this user in this company
      await supabase
        .from("user_permissions")
        .delete()
        .eq("user_id", selectedUser.user_id)
        .eq("company_id", currentCompany!.id);

      // Insert all permissions with the specified value
      const permissions = MODULES.map((module) => ({
        user_id: selectedUser.user_id!,
        company_id: currentCompany!.id,
        module,
        can_view: grantAll,
        can_create: grantAll,
        can_edit: grantAll,
        can_delete: grantAll,
      }));

      const { error } = await supabase.from("user_permissions").insert(permissions);
      if (error) throw error;
    },
    onSuccess: (_, { grantAll }) => {
      queryClient.invalidateQueries({ queryKey: ["user-permissions"] });
      toast.success(grantAll ? "Acesso total concedido!" : "Permissões removidas!");
    },
    onError: () => {
      toast.error("Erro ao atualizar permissões.");
    },
  });

  const getPermissionValue = (module: string, permission: keyof UserPermission) => {
    const perm = userPermissions?.find((p) => p.module === module);
    return perm?.[permission] ?? false;
  };

  // Check if user has all permissions (is "admin-like")
  const hasAllPermissions = MODULES.every((module) => {
    const perm = userPermissions?.find((p) => p.module === module);
    return perm?.can_view && perm?.can_create && perm?.can_edit && perm?.can_delete;
  });

  const handleToggleAllPermissions = (checked: boolean) => {
    batchUpdatePermissionsMutation.mutate({ grantAll: checked });
  };

  const handlePermissionChange = (
    module: string,
    permission: "can_view" | "can_create" | "can_edit" | "can_delete",
    value: boolean
  ) => {
    updatePermissionMutation.mutate({ module, permission, value });
  };

  const handleInviteSubmit = () => {
    if (inviteForm.password !== inviteForm.confirmPassword) {
      toast.error("As senhas não coincidem.");
      return;
    }
    if (inviteForm.password.length < 6) {
      toast.error("A senha deve ter pelo menos 6 caracteres.");
      return;
    }
    inviteMutation.mutate({
      email: inviteForm.email,
      full_name: inviteForm.full_name,
      password: inviteForm.password,
    });
  };

  const handleResendSubmit = () => {
    if (!resendUser?.user_id) {
      toast.error("Usuário ainda não ativou a conta.");
      return;
    }
    if (resendPassword !== resendConfirmPassword) {
      toast.error("As senhas não coincidem.");
      return;
    }
    if (resendPassword.length < 6) {
      toast.error("A senha deve ter pelo menos 6 caracteres.");
      return;
    }
    resendMutation.mutate({
      userId: resendUser.user_id,
      email: resendUser.email,
      fullName: resendUser.full_name || resendUser.email,
      newPassword: resendPassword,
    });
  };

  const canSubmitInvite = 
    inviteForm.email && 
    inviteForm.password && 
    inviteForm.confirmPassword && 
    inviteForm.password === inviteForm.confirmPassword &&
    inviteForm.password.length >= 6;

  const canSubmitResend = 
    resendPassword && 
    resendConfirmPassword && 
    resendPassword === resendConfirmPassword &&
    resendPassword.length >= 6;

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
                  Cadastrar Usuário
                </Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>Cadastrar Novo Usuário</DialogTitle>
                  <DialogDescription>
                    Defina o email e senha de acesso. O usuário receberá as credenciais por email.
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
                  <div className="space-y-2">
                    <Label htmlFor="password">Senha de Acesso</Label>
                    <div className="relative">
                      <Input
                        id="password"
                        type={showPassword ? "text" : "password"}
                        placeholder="Mínimo 6 caracteres"
                        value={inviteForm.password}
                        onChange={(e) =>
                          setInviteForm({ ...inviteForm, password: e.target.value })
                        }
                      />
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        className="absolute right-1 top-1/2 -translate-y-1/2 h-7 w-7"
                        onClick={() => setShowPassword(!showPassword)}
                      >
                        {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                      </Button>
                    </div>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="confirmPassword">Confirmar Senha</Label>
                    <div className="relative">
                      <Input
                        id="confirmPassword"
                        type={showConfirmPassword ? "text" : "password"}
                        placeholder="Repita a senha"
                        value={inviteForm.confirmPassword}
                        onChange={(e) =>
                          setInviteForm({ ...inviteForm, confirmPassword: e.target.value })
                        }
                      />
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        className="absolute right-1 top-1/2 -translate-y-1/2 h-7 w-7"
                        onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                      >
                        {showConfirmPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                      </Button>
                    </div>
                    {inviteForm.confirmPassword && inviteForm.password !== inviteForm.confirmPassword && (
                      <p className="text-sm text-destructive">As senhas não coincidem</p>
                    )}
                  </div>
                </div>
                <DialogFooter>
                  <Button variant="outline" onClick={() => setIsInviteOpen(false)}>
                    Cancelar
                  </Button>
                  <Button
                    onClick={handleInviteSubmit}
                    disabled={!canSubmitInvite || inviteMutation.isPending}
                  >
                    {inviteMutation.isPending ? (
                      <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                    ) : (
                      <Plus className="w-4 h-4 mr-2" />
                    )}
                    Criar Usuário
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
              Nenhum usuário cadastrado ainda. Clique em "Cadastrar Usuário" para adicionar.
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Nome</TableHead>
                  <TableHead>Email</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="w-12 text-right">Ações</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {companyUsers?.map((companyUser) => {
                  const isOwner = companyUser.id.startsWith("owner:");
                  const canManage = isAdmin || canEditPermissions;
                  return (
                    <TableRow key={companyUser.id}>
                      <TableCell className="font-medium">
                        <div className="flex items-center gap-2">
                          {companyUser.full_name || "-"}
                          {isOwner && (
                            <Badge variant="outline" className="text-[10px] uppercase tracking-wide">
                              Desenvolvedor
                            </Badge>
                          )}
                        </div>
                      </TableCell>
                      <TableCell>{companyUser.email}</TableCell>
                      <TableCell>
                        {isOwner ? (
                          <Badge variant="default" className="bg-orange-500">
                            Admin
                          </Badge>
                        ) : companyUser.accepted_at ? (
                          <Badge variant="default" className="bg-green-500">
                            Ativo
                          </Badge>
                        ) : (
                          <Badge variant="secondary">Pendente</Badge>
                        )}
                      </TableCell>
                      <TableCell className="text-right">
                        {!isOwner ? (
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <Button variant="ghost" size="icon" className="h-8 w-8">
                                <MoreHorizontal className="w-4 h-4" />
                                <span className="sr-only">Ações</span>
                              </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end" className="w-56">
                              {canManage && companyUser.user_id && (
                                <DropdownMenuItem
                                  onClick={() => {
                                    setSelectedUser(companyUser);
                                    setPermissionsDialogOpen(true);
                                  }}
                                  disabled={!companyUser.accepted_at}
                                >
                                  <LockKey className="w-4 h-4 mr-2" />
                                  Permissões
                                </DropdownMenuItem>
                              )}
                              {companyUser.user_id && (
                                <DropdownMenuItem onClick={() => setResendUser(companyUser)}>
                                  <Mail className="w-4 h-4 mr-2" />
                                  Reenviar dados de acesso
                                </DropdownMenuItem>
                              )}
                              {(canManage || companyUser.user_id) && <DropdownMenuSeparator />}
                              <DropdownMenuItem
                                onClick={() => setUserToDelete(companyUser)}
                                className="text-destructive focus:text-destructive"
                              >
                                <Trash2 className="w-4 h-4 mr-2" />
                                Excluir
                              </DropdownMenuItem>
                            </DropdownMenuContent>
                          </DropdownMenu>
                        ) : (
                          <span className="text-xs text-muted-foreground pr-2">—</span>
                        )}
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {/* Permissions Dialog */}
      <Dialog
        open={permissionsDialogOpen}
        onOpenChange={(open) => {
          setPermissionsDialogOpen(open);
          if (!open) setSelectedUser(null);
        }}
      >
        <DialogContent className="max-w-3xl max-h-[90vh] flex flex-col p-0 gap-0">
          <DialogHeader className="px-6 pt-6 pb-4 border-b">
            <div className="flex items-start justify-between gap-4">
              <div className="flex items-center gap-3 min-w-0">
                <div className="w-11 h-11 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
                  <span className="text-primary font-semibold">
                    {selectedUser
                      ? (selectedUser.full_name || selectedUser.email)[0].toUpperCase()
                      : "?"}
                  </span>
                </div>
                <div className="min-w-0">
                  <DialogTitle className="truncate">
                    Permissões de {selectedUser?.full_name || selectedUser?.email}
                  </DialogTitle>
                  <DialogDescription className="truncate">
                    {selectedUser?.accepted_at
                      ? "Defina o que este usuário pode fazer em cada módulo"
                      : "Este usuário ainda não ativou a conta"}
                  </DialogDescription>
                </div>
              </div>
              {selectedUser?.accepted_at && (isAdmin || canEditPermissions) && (
                <div className="flex items-center gap-3 px-3 py-2 rounded-lg bg-primary/5 border border-primary/20 shrink-0">
                  <ShieldCheck className="w-5 h-5 text-primary" />
                  <div className="flex flex-col">
                    <Label htmlFor="admin-toggle" className="text-sm font-medium leading-tight">
                      Acesso total
                    </Label>
                    <span className="text-[11px] text-muted-foreground leading-tight">
                      Marcar tudo
                    </span>
                  </div>
                  <Switch
                    id="admin-toggle"
                    checked={hasAllPermissions}
                    onCheckedChange={handleToggleAllPermissions}
                    disabled={batchUpdatePermissionsMutation.isPending}
                  />
                </div>
              )}
            </div>
          </DialogHeader>

          <div className="flex-1 min-h-0 overflow-y-auto px-6 py-4">
            {!selectedUser ? null : !selectedUser.accepted_at ? (
              <div className="flex flex-col items-center text-center py-10 gap-2">
                <WarningCircle className="w-10 h-10 text-muted-foreground" weight="duotone" />
                <p className="font-medium">Conta ainda não ativada</p>
                <p className="text-sm text-muted-foreground max-w-sm">
                  Reenvie os dados de acesso para o usuário ativar a conta. As permissões
                  ficam disponíveis depois disso.
                </p>
              </div>
            ) : isLoadingPermissions ? (
              <div className="flex items-center justify-center py-12">
                <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
              </div>
            ) : !(isAdmin || canEditPermissions) ? (
              <div className="text-center py-10 text-muted-foreground">
                Você não tem permissão para editar as permissões deste usuário.
              </div>
            ) : (
              <div className="space-y-6">
                {MODULE_GROUPS.map((group) => (
                  <section key={group.label}>
                    <header className="mb-3">
                      <h3 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
                        {group.label}
                      </h3>
                      {group.description && (
                        <p className="text-xs text-muted-foreground/80">{group.description}</p>
                      )}
                    </header>
                    <div className="rounded-lg border overflow-hidden">
                      <Table>
                        <TableHeader>
                          <TableRow className="bg-muted/40 hover:bg-muted/40">
                            <TableHead className="font-medium">Módulo</TableHead>
                            <TableHead className="text-center w-20 font-medium">Ver</TableHead>
                            <TableHead className="text-center w-20 font-medium">Criar</TableHead>
                            <TableHead className="text-center w-20 font-medium">Editar</TableHead>
                            <TableHead className="text-center w-20 font-medium">Excluir</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {group.modules.map((module) => (
                            <TableRow key={module}>
                              <TableCell className="font-medium text-sm">
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
                    </div>
                  </section>
                ))}
              </div>
            )}
          </div>

          <DialogFooter className="px-6 py-4 border-t">
            <Button onClick={() => setPermissionsDialogOpen(false)}>Concluir</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Resend Access Data Dialog */}
      <Dialog open={!!resendUser} onOpenChange={() => {
        setResendUser(null);
        setResendPassword("");
        setResendConfirmPassword("");
      }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Reenviar Dados de Acesso</DialogTitle>
            <DialogDescription>
              Defina uma nova senha para <strong>{resendUser?.full_name || resendUser?.email}</strong>. 
              As novas credenciais serão enviadas por email.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="resendPassword">Nova Senha</Label>
              <div className="relative">
                <Input
                  id="resendPassword"
                  type={showResendPassword ? "text" : "password"}
                  placeholder="Mínimo 6 caracteres"
                  value={resendPassword}
                  onChange={(e) => setResendPassword(e.target.value)}
                />
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="absolute right-1 top-1/2 -translate-y-1/2 h-7 w-7"
                  onClick={() => setShowResendPassword(!showResendPassword)}
                >
                  {showResendPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </Button>
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="resendConfirmPassword">Confirmar Nova Senha</Label>
              <Input
                id="resendConfirmPassword"
                type="password"
                placeholder="Repita a nova senha"
                value={resendConfirmPassword}
                onChange={(e) => setResendConfirmPassword(e.target.value)}
              />
              {resendConfirmPassword && resendPassword !== resendConfirmPassword && (
                <p className="text-sm text-destructive">As senhas não coincidem</p>
              )}
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => {
              setResendUser(null);
              setResendPassword("");
              setResendConfirmPassword("");
            }}>
              Cancelar
            </Button>
            <Button
              onClick={handleResendSubmit}
              disabled={!canSubmitResend || resendMutation.isPending}
            >
              {resendMutation.isPending ? (
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
              ) : (
                <Mail className="w-4 h-4 mr-2" />
              )}
              Reenviar Acesso
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

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
