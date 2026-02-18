import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useDashboard } from "@/contexts/DashboardContext";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { Separator } from "@/components/ui/separator";
import {
  MessageSquare,
  Wifi,
  WifiOff,
  Loader2,
  QrCode,
  Save,
  Phone,
  Bell,
} from "lucide-react";
import { toast } from "sonner";
import { DEFAULT_TEMPLATES } from "@/lib/whatsappNotifications";
import QRCodeModal from "./QRCodeModal";

const WhatsAppConfigTab = () => {
  const { currentCompany } = useDashboard();
  const queryClient = useQueryClient();
  const [qrModalOpen, setQrModalOpen] = useState(false);
  const [savingTemplates, setSavingTemplates] = useState<Record<string, boolean>>({});
  const [editedTemplates, setEditedTemplates] = useState<Record<string, { message: string; enabled: boolean }>>({});

  // Fetch WhatsApp instance
  const { data: instance, isLoading: loadingInstance } = useQuery({
    queryKey: ["whatsapp-instance", currentCompany?.id],
    queryFn: async () => {
      if (!currentCompany?.id) return null;
      const { data, error } = await supabase
        .from("whatsapp_instances")
        .select("*")
        .eq("company_id", currentCompany.id)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
    enabled: !!currentCompany?.id,
  });

  // Fetch notification templates
  const { data: templates = [] } = useQuery({
    queryKey: ["notification-templates", currentCompany?.id],
    queryFn: async () => {
      if (!currentCompany?.id) return [];
      const { data, error } = await supabase
        .from("notification_templates")
        .select("*")
        .eq("company_id", currentCompany.id);
      if (error) throw error;
      return data;
    },
    enabled: !!currentCompany?.id,
  });

  // Initialize templates from DB or defaults
  const getTemplateData = (eventType: string) => {
    if (editedTemplates[eventType]) return editedTemplates[eventType];
    const dbTemplate = templates.find((t: any) => t.event_type === eventType);
    if (dbTemplate) return { message: dbTemplate.message_template, enabled: dbTemplate.is_enabled };
    const defaultTemplate = DEFAULT_TEMPLATES[eventType];
    return { message: defaultTemplate?.message || "", enabled: true };
  };

  // Connect WhatsApp
  const connectMutation = useMutation({
    mutationFn: async () => {
      const { data, error } = await supabase.functions.invoke("whatsapp-api", {
        body: { action: "create_instance", company_id: currentCompany!.id },
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["whatsapp-instance"] });
      setQrModalOpen(true);
    },
    onError: (err: any) => {
      toast.error("Erro ao conectar: " + err.message);
    },
  });

  // Disconnect WhatsApp
  const disconnectMutation = useMutation({
    mutationFn: async () => {
      const { data, error } = await supabase.functions.invoke("whatsapp-api", {
        body: {
          action: "disconnect_instance",
          company_id: currentCompany!.id,
          instance_name: instance?.instance_name,
        },
      });
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["whatsapp-instance"] });
      toast.success("WhatsApp desconectado!");
    },
    onError: (err: any) => {
      toast.error("Erro ao desconectar: " + err.message);
    },
  });

  // Save template
  const handleSaveTemplate = async (eventType: string) => {
    if (!currentCompany?.id) return;
    setSavingTemplates((prev) => ({ ...prev, [eventType]: true }));

    try {
      const templateData = getTemplateData(eventType);
      const { error } = await supabase.from("notification_templates").upsert(
        {
          company_id: currentCompany.id,
          event_type: eventType,
          message_template: templateData.message,
          is_enabled: templateData.enabled,
        },
        { onConflict: "company_id,event_type" }
      );
      if (error) throw error;
      queryClient.invalidateQueries({ queryKey: ["notification-templates"] });
      toast.success("Template salvo!");
    } catch (err: any) {
      toast.error("Erro ao salvar: " + err.message);
    } finally {
      setSavingTemplates((prev) => ({ ...prev, [eventType]: false }));
    }
  };

  const handleConnect = () => {
    if (instance?.instance_name) {
      // Instance exists, just open QR modal
      setQrModalOpen(true);
    } else {
      connectMutation.mutate();
    }
  };

  const isConnected = instance?.status === "open";

  return (
    <div className="space-y-6">
      {/* Connection Status Card */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <MessageSquare className="w-5 h-5 text-primary" />
            Conexão WhatsApp
          </CardTitle>
          <CardDescription>
            Conecte seu WhatsApp para enviar notificações automáticas aos colaboradores
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <div
                className={`w-12 h-12 rounded-full flex items-center justify-center ${
                  isConnected ? "bg-green-100 dark:bg-green-900/30" : "bg-muted"
                }`}
              >
                {isConnected ? (
                  <Wifi className="w-6 h-6 text-green-600" />
                ) : (
                  <WifiOff className="w-6 h-6 text-muted-foreground" />
                )}
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <span className="font-medium">Status:</span>
                  <Badge variant={isConnected ? "default" : "secondary"}>
                    {isConnected ? "Conectado" : instance?.status === "connecting" ? "Conectando..." : "Desconectado"}
                  </Badge>
                </div>
                {instance?.phone_number && (
                  <p className="text-sm text-muted-foreground flex items-center gap-1 mt-1">
                    <Phone className="w-3 h-3" />
                    +{instance.phone_number}
                  </p>
                )}
              </div>
            </div>

            <div className="flex gap-2">
              {isConnected ? (
                <Button
                  variant="destructive"
                  onClick={() => disconnectMutation.mutate()}
                  disabled={disconnectMutation.isPending}
                >
                  {disconnectMutation.isPending && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
                  Desconectar
                </Button>
              ) : (
                <Button
                  onClick={handleConnect}
                  disabled={connectMutation.isPending || loadingInstance}
                >
                  {connectMutation.isPending ? (
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  ) : (
                    <QrCode className="w-4 h-4 mr-2" />
                  )}
                  Conectar WhatsApp
                </Button>
              )}
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Notification Templates */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Bell className="w-5 h-5 text-primary" />
            Notificações
          </CardTitle>
          <CardDescription>
            Configure as mensagens automáticas enviadas aos colaboradores
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          {Object.entries(DEFAULT_TEMPLATES).map(([eventType, defaultTemplate], index) => {
            const templateData = getTemplateData(eventType);
            const isSaving = savingTemplates[eventType];
            return (
              <div key={eventType}>
                {index > 0 && <Separator className="mb-6" />}
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <div>
                      <h4 className="font-medium">{defaultTemplate.label}</h4>
                      <p className="text-sm text-muted-foreground">{defaultTemplate.description}</p>
                    </div>
                    <Switch
                      checked={templateData.enabled}
                      onCheckedChange={(checked) => {
                        setEditedTemplates((prev) => ({
                          ...prev,
                          [eventType]: { ...templateData, enabled: checked },
                        }));
                      }}
                    />
                  </div>
                  <Textarea
                    value={templateData.message}
                    onChange={(e) => {
                      setEditedTemplates((prev) => ({
                        ...prev,
                        [eventType]: { ...templateData, message: e.target.value },
                      }));
                    }}
                    rows={5}
                    className="font-mono text-sm"
                  />
                  <div className="flex items-center justify-between">
                    <p className="text-xs text-muted-foreground">
                      Variáveis: {defaultTemplate.variables.map((v) => `{${v}}`).join(", ")}
                    </p>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => handleSaveTemplate(eventType)}
                      disabled={isSaving}
                    >
                      {isSaving ? (
                        <Loader2 className="w-3 h-3 mr-1 animate-spin" />
                      ) : (
                        <Save className="w-3 h-3 mr-1" />
                      )}
                      Salvar
                    </Button>
                  </div>
                </div>
              </div>
            );
          })}
        </CardContent>
      </Card>

      {/* QR Code Modal */}
      <QRCodeModal
        open={qrModalOpen}
        onOpenChange={setQrModalOpen}
        instanceName={instance?.instance_name || null}
      />
    </div>
  );
};

export default WhatsAppConfigTab;
