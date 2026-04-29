import { usePortal } from "@/contexts/PortalContext";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { FileText, Gift, Download, User, TreePalm as Palmtree, ClipboardText as ClipboardCheck } from "@phosphor-icons/react";
import { Link } from "react-router-dom";

const PortalHome = () => {
  const { collaborator } = usePortal();

  const quickLinks = [
    {
      title: "Meu Extrato",
      description: "Visualize seus lançamentos financeiros",
      icon: FileText,
      url: "/colaborador/extrato",
      color: "bg-blue-100 text-blue-600",
    },
    {
      title: "Benefícios",
      description: "Confira seus benefícios ativos",
      icon: Gift,
      url: "/colaborador/beneficios",
      color: "bg-green-100 text-green-600",
    },
    {
      title: "Contracheques",
      description: "Baixe seus contracheques",
      icon: Download,
      url: "/colaborador/contracheques",
      color: "bg-purple-100 text-purple-600",
    },
    {
      title: "Minhas Férias",
      description: "Acompanhe e solicite férias",
      icon: Palmtree,
      url: "/colaborador/ferias",
      color: "bg-orange-100 text-orange-600",
    },
    {
      title: "Meus Exames",
      description: "Exames ocupacionais e ASOs",
      icon: ClipboardCheck,
      url: "/colaborador/exames",
      color: "bg-teal-100 text-teal-600",
    },
  ];

  return (
    <div className="space-y-6">
      {/* Welcome Card */}
      <Card className="bg-gradient-to-r from-primary/10 to-primary/5 border-primary/20">
        <CardContent className="p-6">
          <div className="flex items-center gap-4">
            <div className="w-14 h-14 rounded-full bg-primary/20 flex items-center justify-center">
              <User className="w-7 h-7 text-primary" />
            </div>
            <div>
              <h1 className="text-xl sm:text-2xl font-bold text-foreground">
                Olá, {collaborator?.name?.split(" ")[0]}!
              </h1>
              <p className="text-muted-foreground">
                Bem-vindo ao seu portal de colaborador
              </p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Quick Links */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {quickLinks.map((link) => (
          <Link key={link.url} to={link.url}>
            <Card className="h-full hover:shadow-md transition-shadow cursor-pointer group">
              <CardContent className="p-6">
                <div
                  className={`w-12 h-12 rounded-lg ${link.color} flex items-center justify-center mb-4 group-hover:scale-110 transition-transform`}
                >
                  <link.icon className="w-6 h-6" />
                </div>
                <h3 className="font-semibold text-foreground mb-1">{link.title}</h3>
                <p className="text-sm text-muted-foreground">{link.description}</p>
              </CardContent>
            </Card>
          </Link>
        ))}
      </div>

      {/* Info Card */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Seus Dados</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <p className="text-sm text-muted-foreground">Nome completo</p>
              <p className="font-medium">{collaborator?.name || "-"}</p>
            </div>
            <div>
              <p className="text-sm text-muted-foreground">Email</p>
              <p className="font-medium">{collaborator?.email || "-"}</p>
            </div>
            <div>
              <p className="text-sm text-muted-foreground">Cargo</p>
              <p className="font-medium">{collaborator?.position || "-"}</p>
            </div>
            <div>
              <p className="text-sm text-muted-foreground">CPF</p>
              <p className="font-medium">
                {collaborator?.cpf
                  ? `***.***.${collaborator.cpf.slice(-5, -2)}-**`
                  : "-"}
              </p>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
};

export default PortalHome;
