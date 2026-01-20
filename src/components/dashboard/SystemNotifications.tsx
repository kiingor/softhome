import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useDashboard } from "@/contexts/DashboardContext";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { X, Info, AlertTriangle, AlertCircle } from "lucide-react";

interface SystemMessage {
  id: string;
  title: string;
  body: string;
  message_type: 'info' | 'warning' | 'alert';
  created_at: string;
  is_read: boolean;
}

export function SystemNotifications() {
  const { profile } = useDashboard();
  const companyId = profile?.company_id;
  const queryClient = useQueryClient();

  const { data: messages } = useQuery({
    queryKey: ['system-messages', companyId],
    queryFn: async () => {
      if (!companyId) return [];

      const { data, error } = await supabase
        .from('system_messages')
        .select('id, title, body, message_type, created_at, is_read')
        .or(`company_id.eq.${companyId},company_id.is.null`)
        .eq('is_read', false)
        .or(`visible_until.is.null,visible_until.gt.${new Date().toISOString()}`)
        .order('created_at', { ascending: false })
        .limit(5);

      if (error) throw error;
      return data as SystemMessage[];
    },
    enabled: !!companyId,
  });

  const markAsReadMutation = useMutation({
    mutationFn: async (messageId: string) => {
      const { error } = await supabase
        .from('system_messages')
        .update({ 
          is_read: true,
          read_at: new Date().toISOString(),
        })
        .eq('id', messageId);

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['system-messages', companyId] });
    },
  });

  if (!messages?.length) return null;

  function getIcon(type: string) {
    switch (type) {
      case 'alert':
        return <AlertCircle className="h-4 w-4" />;
      case 'warning':
        return <AlertTriangle className="h-4 w-4" />;
      default:
        return <Info className="h-4 w-4" />;
    }
  }

  function getVariant(type: string): 'default' | 'destructive' {
    return type === 'alert' ? 'destructive' : 'default';
  }

  return (
    <div className="space-y-3 mb-6">
      {messages.map((message) => (
        <Alert 
          key={message.id} 
          variant={getVariant(message.message_type)}
          className="relative pr-12"
        >
          {getIcon(message.message_type)}
          <AlertTitle>{message.title}</AlertTitle>
          <AlertDescription>{message.body}</AlertDescription>
          <Button
            variant="ghost"
            size="icon"
            className="absolute top-2 right-2 h-6 w-6"
            onClick={() => markAsReadMutation.mutate(message.id)}
            disabled={markAsReadMutation.isPending}
          >
            <X className="h-4 w-4" />
          </Button>
        </Alert>
      ))}
    </div>
  );
}