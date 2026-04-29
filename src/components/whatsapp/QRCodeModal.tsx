import { useState, useEffect, useRef } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useDashboard } from "@/contexts/DashboardContext";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { CircleNotch as Loader2, CheckCircle, DeviceMobile as Smartphone } from "@phosphor-icons/react";
import { toast } from "sonner";

interface QRCodeModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  instanceName: string | null;
}

const QRCodeModal = ({ open, onOpenChange, instanceName }: QRCodeModalProps) => {
  const { currentCompany } = useDashboard();
  const queryClient = useQueryClient();
  const [qrCode, setQrCode] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [connected, setConnected] = useState(false);
  const pollingRef = useRef<number | null>(null);

  const fetchQRCode = async () => {
    if (!instanceName) return;
    setLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke("whatsapp-api", {
        body: {
          action: "get_qrcode",
          company_id: currentCompany!.id,
          instance_name: instanceName,
        },
      });
      if (error) throw error;

      if (data?.base64) {
        setQrCode(data.base64);
      } else if (data?.qrcode?.base64) {
        setQrCode(data.qrcode.base64);
      } else if (typeof data?.qrcode === "string") {
        setQrCode(data.qrcode);
      }
    } catch (err) {
      console.error("QR fetch error:", err);
    } finally {
      setLoading(false);
    }
  };

  const checkStatus = async () => {
    if (!instanceName || !currentCompany) return;
    try {
      const { data, error } = await supabase.functions.invoke("whatsapp-api", {
        body: {
          action: "check_status",
          company_id: currentCompany.id,
          instance_name: instanceName,
        },
      });
      if (error) return;

      const state = data?.instance?.state;
      if (state === "open") {
        setConnected(true);
        queryClient.invalidateQueries({ queryKey: ["whatsapp-instance"] });
        toast.success("WhatsApp conectado com sucesso! 🎉");
        if (pollingRef.current) {
          clearInterval(pollingRef.current);
          pollingRef.current = null;
        }
        setTimeout(() => onOpenChange(false), 2000);
      }
    } catch (err) {
      console.error("Status check error:", err);
    }
  };

  useEffect(() => {
    if (open && instanceName) {
      setConnected(false);
      setQrCode(null);
      fetchQRCode();

      // Poll for connection status every 3 seconds
      pollingRef.current = window.setInterval(() => {
        checkStatus();
      }, 3000);
    }

    return () => {
      if (pollingRef.current) {
        clearInterval(pollingRef.current);
        pollingRef.current = null;
      }
    };
  }, [open, instanceName]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Smartphone className="w-5 h-5 text-primary" />
            Conectar WhatsApp
          </DialogTitle>
        </DialogHeader>

        <div className="flex flex-col items-center py-6">
          {connected ? (
            <div className="text-center space-y-4">
              <div className="w-20 h-20 rounded-full bg-green-100 dark:bg-green-900/30 flex items-center justify-center mx-auto">
                <CheckCircle className="w-10 h-10 text-green-600" />
              </div>
              <div>
                <p className="font-semibold text-lg">Conectado!</p>
                <p className="text-sm text-muted-foreground">
                  Seu WhatsApp foi conectado com sucesso
                </p>
              </div>
            </div>
          ) : loading && !qrCode ? (
            <div className="flex flex-col items-center gap-4 py-8">
              <Loader2 className="w-8 h-8 animate-spin text-primary" />
              <p className="text-sm text-muted-foreground">Gerando QR Code...</p>
            </div>
          ) : qrCode ? (
            <div className="space-y-4 text-center">
              <div className="bg-white p-4 rounded-lg inline-block">
                <img
                  src={qrCode.startsWith("data:") ? qrCode : `data:image/png;base64,${qrCode}`}
                  alt="QR Code WhatsApp"
                  className="w-64 h-64"
                />
              </div>
              <div className="space-y-1">
                <p className="font-medium">Escaneie o QR Code</p>
                <p className="text-sm text-muted-foreground">
                  Abra o WhatsApp no seu celular → Configurações → Aparelhos Conectados → Conectar um aparelho
                </p>
              </div>
              <div className="flex items-center gap-2 justify-center text-sm text-muted-foreground">
                <Loader2 className="w-3 h-3 animate-spin" />
                Aguardando conexão...
              </div>
            </div>
          ) : (
            <p className="text-muted-foreground">Não foi possível gerar o QR Code. Tente novamente.</p>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default QRCodeModal;
