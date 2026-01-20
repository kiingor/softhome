import { Card, CardContent } from "@/components/ui/card";
import { FileText, Upload, Download } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useDashboard } from "@/contexts/DashboardContext";

const DocumentosPage = () => {
  const { hasAnyRole } = useDashboard();
  const canManage = hasAnyRole(["admin", "rh"]);

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Documentos</h1>
          <p className="text-muted-foreground">
            {canManage ? "Gerencie documentos da empresa" : "Seus documentos"}
          </p>
        </div>
        {canManage && (
          <Button variant="hero">
            <Upload className="w-4 h-4 mr-2" />
            Upload
          </Button>
        )}
      </div>

      <Card className="border border-border">
        <CardContent className="p-12 text-center">
          <div className="w-16 h-16 rounded-full bg-muted flex items-center justify-center mx-auto mb-4">
            <FileText className="w-8 h-8 text-muted-foreground" />
          </div>
          <h2 className="text-lg font-semibold text-foreground mb-2">
            Nenhum documento
          </h2>
          <p className="text-muted-foreground max-w-sm mx-auto">
            {canManage
              ? "Faça upload de documentos para compartilhar com a equipe."
              : "Seus documentos aparecerão aqui."}
          </p>
        </CardContent>
      </Card>
    </div>
  );
};

export default DocumentosPage;
