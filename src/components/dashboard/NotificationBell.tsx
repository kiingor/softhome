import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useDashboard } from "@/contexts/DashboardContext";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Bell, Info, Warning as AlertTriangle, WarningCircle as AlertCircle, Check, X } from "@phosphor-icons/react";
import { formatDistanceToNow } from "date-fns";
import { ptBR } from "date-fns/locale";

interface SystemMessage {
  id: string;
  title: string;
  body: string;
  message_type: "info" | "warning" | "alert";
  image_url: string | null;
  created_at: string;
  is_read: boolean;
}

export function NotificationBell() {
  const { profile } = useDashboard();
  const companyId = profile?.company_id;
  const queryClient = useQueryClient();
  const [isOpen, setIsOpen] = useState(false);
  const [selectedMessage, setSelectedMessage] = useState<SystemMessage | null>(null);

  const { data: messages = [] } = useQuery({
    queryKey: ["system-messages", companyId],
    queryFn: async () => {
      if (!companyId) return [];

      const { data, error } = await supabase
        .from("system_messages")
        .select("id, title, body, message_type, image_url, created_at, is_read")
        .or(`company_id.eq.${companyId},company_id.is.null`)
        .or(`visible_until.is.null,visible_until.gt.${new Date().toISOString()}`)
        .order("created_at", { ascending: false })
        .limit(20);

      if (error) throw error;
      return data as SystemMessage[];
    },
    enabled: !!companyId,
    refetchInterval: 60000, // Refetch every minute
  });

  const markAsReadMutation = useMutation({
    mutationFn: async (messageId: string) => {
      const { error } = await supabase
        .from("system_messages")
        .update({
          is_read: true,
          read_at: new Date().toISOString(),
        })
        .eq("id", messageId);

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["system-messages", companyId] });
    },
  });

  const markAllAsReadMutation = useMutation({
    mutationFn: async () => {
      const unreadIds = messages.filter((m) => !m.is_read).map((m) => m.id);
      if (unreadIds.length === 0) return;

      const { error } = await supabase
        .from("system_messages")
        .update({
          is_read: true,
          read_at: new Date().toISOString(),
        })
        .in("id", unreadIds);

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["system-messages", companyId] });
    },
  });

  const unreadCount = messages.filter((m) => !m.is_read).length;

  const getIcon = (type: string) => {
    switch (type) {
      case "alert":
        return <AlertCircle className="h-4 w-4 text-destructive" />;
      case "warning":
        return <AlertTriangle className="h-4 w-4 text-yellow-500" />;
      default:
        return <Info className="h-4 w-4 text-primary" />;
    }
  };

  const getTypeColor = (type: string) => {
    switch (type) {
      case "alert":
        return "bg-destructive/10 border-destructive/20";
      case "warning":
        return "bg-yellow-50 border-yellow-200";
      default:
        return "bg-primary/5 border-primary/10";
    }
  };

  const handleNotificationClick = (message: SystemMessage) => {
    setSelectedMessage(message);
    if (!message.is_read) {
      markAsReadMutation.mutate(message.id);
    }
  };

  return (
    <>
      <Popover open={isOpen} onOpenChange={setIsOpen}>
        <PopoverTrigger asChild>
          <Button variant="ghost" size="icon" className="relative">
            <Bell className="h-5 w-5" />
            {unreadCount > 0 && (
              <Badge
                variant="destructive"
                className="absolute -top-1 -right-1 h-5 w-5 flex items-center justify-center p-0 text-xs animate-pulse"
              >
                {unreadCount > 9 ? "9+" : unreadCount}
              </Badge>
            )}
          </Button>
        </PopoverTrigger>
        <PopoverContent align="end" className="w-80 p-0">
          <div className="flex items-center justify-between p-3 border-b">
            <h4 className="font-semibold text-sm">Notificações</h4>
            {unreadCount > 0 && (
              <Button
                variant="ghost"
                size="sm"
                className="h-7 text-xs"
                onClick={() => markAllAsReadMutation.mutate()}
                disabled={markAllAsReadMutation.isPending}
              >
                <Check className="h-3 w-3 mr-1" />
                Marcar todas como lidas
              </Button>
            )}
          </div>

          <ScrollArea className="max-h-80">
            {messages.length === 0 ? (
              <div className="p-6 text-center text-muted-foreground">
                <Bell className="h-8 w-8 mx-auto mb-2 opacity-50" />
                <p className="text-sm">Nenhuma notificação</p>
              </div>
            ) : (
              <div className="divide-y">
                {messages.map((message) => (
                  <button
                    key={message.id}
                    onClick={() => handleNotificationClick(message)}
                    className={`w-full p-3 text-left hover:bg-muted/50 transition-colors ${
                      !message.is_read ? "bg-primary/5" : ""
                    }`}
                  >
                    <div className="flex gap-3">
                      <div className="shrink-0 mt-0.5">{getIcon(message.message_type)}</div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-start justify-between gap-2">
                          <p
                            className={`text-sm font-medium truncate ${
                              !message.is_read ? "text-foreground" : "text-muted-foreground"
                            }`}
                          >
                            {message.title}
                          </p>
                          {!message.is_read && (
                            <span className="w-2 h-2 rounded-full bg-primary shrink-0 mt-1.5" />
                          )}
                        </div>
                        <p className="text-xs text-muted-foreground line-clamp-2 mt-0.5">
                          {message.body}
                        </p>
                        <p className="text-xs text-muted-foreground/70 mt-1">
                          {formatDistanceToNow(new Date(message.created_at), {
                            addSuffix: true,
                            locale: ptBR,
                          })}
                        </p>
                      </div>
                    </div>
                  </button>
                ))}
              </div>
            )}
          </ScrollArea>
        </PopoverContent>
      </Popover>

      {/* Full Notification Dialog */}
      <Dialog open={!!selectedMessage} onOpenChange={() => setSelectedMessage(null)}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <div className="flex items-center gap-2">
              {selectedMessage && getIcon(selectedMessage.message_type)}
              <DialogTitle>{selectedMessage?.title}</DialogTitle>
            </div>
            <DialogDescription>
              {selectedMessage &&
                formatDistanceToNow(new Date(selectedMessage.created_at), {
                  addSuffix: true,
                  locale: ptBR,
                })}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            {selectedMessage?.image_url && (
              <div className="rounded-lg overflow-hidden border">
                <img
                  src={selectedMessage.image_url}
                  alt="Imagem da notificação"
                  className="w-full h-auto max-h-64 object-cover"
                />
              </div>
            )}

            <div
              className={`p-4 rounded-lg border ${
                selectedMessage ? getTypeColor(selectedMessage.message_type) : ""
              }`}
            >
              <p className="text-sm whitespace-pre-wrap">{selectedMessage?.body}</p>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
