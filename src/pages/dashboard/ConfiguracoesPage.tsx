import RoleGuard from "@/components/dashboard/RoleGuard";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Settings, Bell, Shield, Palette } from "lucide-react";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";

const ConfiguracoesPage = () => {
  return (
    <RoleGuard allowedRoles={["admin", "rh"]}>
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Configurações</h1>
          <p className="text-muted-foreground">Personalize o sistema para sua empresa</p>
        </div>

        <div className="grid lg:grid-cols-2 gap-6">
          <Card className="border border-border">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Bell className="w-5 h-5 text-primary" />
                Notificações
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex items-center justify-between">
                <Label htmlFor="email-notifications">Notificações por email</Label>
                <Switch id="email-notifications" defaultChecked />
              </div>
              <div className="flex items-center justify-between">
                <Label htmlFor="vacation-alerts">Alertas de férias</Label>
                <Switch id="vacation-alerts" defaultChecked />
              </div>
              <div className="flex items-center justify-between">
                <Label htmlFor="doc-expiry">Documentos vencendo</Label>
                <Switch id="doc-expiry" defaultChecked />
              </div>
            </CardContent>
          </Card>

          <Card className="border border-border">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Shield className="w-5 h-5 text-primary" />
                Segurança
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex items-center justify-between">
                <Label htmlFor="two-factor">Autenticação em 2 fatores</Label>
                <Switch id="two-factor" />
              </div>
              <div className="flex items-center justify-between">
                <Label htmlFor="session-timeout">Timeout de sessão</Label>
                <Switch id="session-timeout" defaultChecked />
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </RoleGuard>
  );
};

export default ConfiguracoesPage;
