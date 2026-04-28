import { useState } from "react";
import { Button } from "@/components/ui/button";
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
import { CircleNotch as Loader2, Plus, Trophy } from "@phosphor-icons/react";
import { useBadges } from "../hooks/use-badges";
import { BadgeCard } from "../components/BadgeCard";
import { BadgeForm } from "../components/BadgeForm";
import type { Badge } from "../types";
import type { BadgeFormValues } from "../schemas/badge.schema";

export default function BadgesPage() {
  const { badges, isLoading, createBadge, updateBadge, deleteBadge } = useBadges();
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [editingBadge, setEditingBadge] = useState<Badge | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<Badge | null>(null);

  const openNew = () => {
    setEditingBadge(null);
    setIsFormOpen(true);
  };

  const openEdit = (badge: Badge) => {
    setEditingBadge(badge);
    setIsFormOpen(true);
  };

  const handleSubmit = async (values: BadgeFormValues) => {
    if (editingBadge) {
      await updateBadge.mutateAsync({ id: editingBadge.id, values });
    } else {
      await createBadge.mutateAsync(values);
    }
    setIsFormOpen(false);
  };

  const confirmDelete = async () => {
    if (!deleteTarget) return;
    await deleteBadge.mutateAsync(deleteTarget.id);
    setDeleteTarget(null);
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Catálogo de Insígnias</h1>
          <p className="text-muted-foreground">
            Conquistas que os colaboradores podem ganhar na Jornada.
          </p>
        </div>
        <Button onClick={openNew}>
          <Plus className="w-4 h-4 mr-2" />
          Nova insígnia
        </Button>
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center py-16">
          <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
        </div>
      ) : badges.length === 0 ? (
        <div className="border-2 border-dashed border-border rounded-lg p-12 text-center">
          <div className="w-16 h-16 rounded-2xl bg-primary/10 flex items-center justify-center mx-auto mb-4">
            <Trophy className="w-8 h-8 text-primary" />
          </div>
          <h2 className="text-lg font-semibold text-foreground mb-2">
            Tá vazio por aqui
          </h2>
          <p className="text-muted-foreground mb-6 max-w-md mx-auto">
            Cadastra a primeira insígnia pra começar a reconhecer conquistas
            do time.
          </p>
          <Button onClick={openNew}>
            <Plus className="w-4 h-4 mr-2" />
            Cadastrar insígnia
          </Button>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {badges.map((badge) => (
            <BadgeCard
              key={badge.id}
              badge={badge}
              onEdit={openEdit}
              onDelete={setDeleteTarget}
            />
          ))}
        </div>
      )}

      <BadgeForm
        open={isFormOpen}
        onOpenChange={setIsFormOpen}
        badge={editingBadge}
        onSubmit={handleSubmit}
        isSubmitting={createBadge.isPending || updateBadge.isPending}
      />

      <AlertDialog open={!!deleteTarget} onOpenChange={(o) => !o && setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remover insígnia?</AlertDialogTitle>
            <AlertDialogDescription>
              {deleteTarget?.name ? `"${deleteTarget.name}" ` : ""}
              vai sair do catálogo. Atribuições já feitas não são afetadas.
              Essa ação não tem volta.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={confirmDelete}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Remover
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
