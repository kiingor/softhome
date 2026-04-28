import { Card, CardContent } from "@/components/ui/card";
import { Badge as BadgeUI } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Pencil, Trash as Trash2, Trophy } from "@phosphor-icons/react";
import type { Badge } from "../types";
import { BADGE_CATEGORY_LABELS } from "../types";

interface BadgeCardProps {
  badge: Badge;
  onEdit?: (badge: Badge) => void;
  onDelete?: (badge: Badge) => void;
}

export function BadgeCard({ badge, onEdit, onDelete }: BadgeCardProps) {
  return (
    <Card className="card-hover">
      <CardContent className="p-5">
        <div className="flex items-start gap-3">
          <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
            <Trophy className="w-5 h-5 text-primary" />
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-start justify-between gap-2">
              <h3 className="font-semibold text-foreground truncate">
                {badge.name}
              </h3>
              {!badge.is_active && (
                <BadgeUI variant="secondary" className="text-xs shrink-0">
                  Inativa
                </BadgeUI>
              )}
            </div>
            <div className="flex items-center gap-2 mt-1">
              <BadgeUI variant="outline" className="text-xs">
                {BADGE_CATEGORY_LABELS[badge.category]}
              </BadgeUI>
              <span className="text-xs text-muted-foreground">
                Peso {badge.weight}
              </span>
            </div>
            {badge.description && (
              <p className="text-sm text-muted-foreground mt-2 line-clamp-2">
                {badge.description}
              </p>
            )}
          </div>
        </div>
        {(onEdit || onDelete) && (
          <div className="flex justify-end gap-1 mt-3 pt-3 border-t border-border">
            {onEdit && (
              <Button
                variant="ghost"
                size="sm"
                onClick={() => onEdit(badge)}
                aria-label="Editar"
              >
                <Pencil className="w-4 h-4" />
              </Button>
            )}
            {onDelete && (
              <Button
                variant="ghost"
                size="sm"
                onClick={() => onDelete(badge)}
                aria-label="Remover"
                className="text-destructive hover:text-destructive"
              >
                <Trash2 className="w-4 h-4" />
              </Button>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
