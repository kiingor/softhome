import { useEffect, useState } from "react";
import { useQuery, useQueryClient, useMutation } from "@tanstack/react-query";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Bell, BellRinging, CheckCircle } from "@phosphor-icons/react";
import { supabase } from "@/integrations/supabase/client";
import { usePortal } from "@/contexts/PortalContext";
import { celebrate } from "./celebrations/CelebrationToast";

type CollabNotification = {
  id: string;
  collaborator_id: string;
  type: string;
  title: string;
  body: string | null;
  payload: Record<string, unknown> | null;
  is_read: boolean;
  read_at: string | null;
  created_at: string;
};

const CELEBRATORY_TYPES = new Set([
  "bonus_first_paid",
  "bonus_second_paid",
  "bonus_anticipated",
  "bonus_paid_single",
]);

export function PortalNotificationBell() {
  const { collaborator } = usePortal();
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);

  const { data: notifications = [] } = useQuery({
    queryKey: ["portal-notifications", collaborator?.id],
    enabled: !!collaborator?.id,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("collaborator_notifications")
        .select("*")
        .eq("collaborator_id", collaborator!.id)
        .order("created_at", { ascending: false })
        .limit(50);
      if (error) throw error;
      return (data ?? []) as CollabNotification[];
    },
  });

  const unreadCount = notifications.filter((n) => !n.is_read).length;

  const markAsRead = useMutation({
    mutationFn: async (ids: string[]) => {
      const { error } = await supabase
        .from("collaborator_notifications")
        .update({ is_read: true, read_at: new Date().toISOString() })
        .in("id", ids);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["portal-notifications"] });
    },
  });

  // Realtime subscribe — quando chegar nova notificação, dá refresh + celebra se for bonus_*
  useEffect(() => {
    if (!collaborator?.id) return;
    const channel = supabase
      .channel(`collab-notif-${collaborator.id}`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "collaborator_notifications",
          filter: `collaborator_id=eq.${collaborator.id}`,
        },
        (payload) => {
          const n = payload.new as CollabNotification;
          qc.invalidateQueries({ queryKey: ["portal-notifications"] });
          if (CELEBRATORY_TYPES.has(n.type)) {
            celebrate({ title: n.title, body: n.body ?? undefined });
          }
        },
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [collaborator?.id, qc]);

  const handleMarkAllRead = () => {
    const unreadIds = notifications.filter((n) => !n.is_read).map((n) => n.id);
    if (unreadIds.length > 0) markAsRead.mutate(unreadIds);
  };

  const handleNotificationClick = (n: CollabNotification) => {
    if (!n.is_read) markAsRead.mutate([n.id]);
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          className="relative shrink-0"
          aria-label={`${unreadCount} notificações não lidas`}
        >
          {unreadCount > 0 ? (
            <BellRinging className="w-5 h-5" weight="duotone" />
          ) : (
            <Bell className="w-5 h-5" />
          )}
          {unreadCount > 0 && (
            <Badge className="absolute -top-1 -right-1 h-5 min-w-5 px-1 text-[10px] flex items-center justify-center rounded-full bg-primary text-primary-foreground border-2 border-background">
              {unreadCount > 9 ? "9+" : unreadCount}
            </Badge>
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-80 p-0" align="end">
        <div className="flex items-center justify-between px-4 py-3 border-b">
          <p className="font-semibold text-sm">Notificações</p>
          {unreadCount > 0 && (
            <button
              type="button"
              onClick={handleMarkAllRead}
              className="text-xs text-primary hover:underline"
            >
              Marcar todas como lidas
            </button>
          )}
        </div>

        <div className="max-h-[420px] overflow-y-auto">
          {notifications.length === 0 ? (
            <div className="py-10 text-center">
              <Bell className="w-10 h-10 mx-auto mb-2 text-muted-foreground/40" />
              <p className="text-sm text-muted-foreground">
                Sem notificações por enquanto.
              </p>
            </div>
          ) : (
            <ul className="divide-y">
              {notifications.map((n) => (
                <li
                  key={n.id}
                  className={`px-4 py-3 cursor-pointer hover:bg-muted/40 transition-colors ${
                    !n.is_read ? "bg-orange-50/50" : ""
                  }`}
                  onClick={() => handleNotificationClick(n)}
                >
                  <div className="flex items-start gap-2">
                    {!n.is_read && (
                      <span className="w-2 h-2 rounded-full bg-primary mt-1.5 shrink-0" />
                    )}
                    <div className={`flex-1 min-w-0 ${n.is_read ? "pl-4" : ""}`}>
                      <p className="text-sm font-medium text-foreground">
                        {n.title}
                      </p>
                      {n.body && (
                        <p className="text-xs text-muted-foreground mt-0.5 line-clamp-2">
                          {n.body}
                        </p>
                      )}
                      <p className="text-[11px] text-muted-foreground/70 mt-1">
                        {timeAgo(n.created_at)}
                      </p>
                    </div>
                    {n.is_read && (
                      <CheckCircle
                        className="w-3.5 h-3.5 text-muted-foreground/40 shrink-0 mt-1"
                        weight="duotone"
                      />
                    )}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
}

function timeAgo(iso: string): string {
  const ms = Date.now() - new Date(iso).getTime();
  const min = Math.floor(ms / 60_000);
  if (min < 1) return "agora";
  if (min < 60) return `há ${min} min`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `há ${hr} h`;
  const day = Math.floor(hr / 24);
  if (day < 7) return `há ${day} ${day === 1 ? "dia" : "dias"}`;
  return new Date(iso).toLocaleDateString("pt-BR");
}
