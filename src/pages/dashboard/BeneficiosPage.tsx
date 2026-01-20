import { Card, CardContent } from "@/components/ui/card";
import { Gift } from "lucide-react";

const BeneficiosPage = () => {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-foreground">Benefícios</h1>
        <p className="text-muted-foreground">Gerencie benefícios dos colaboradores</p>
      </div>

      <Card className="border border-border">
        <CardContent className="p-12 text-center">
          <div className="w-16 h-16 rounded-full bg-purple-100 flex items-center justify-center mx-auto mb-4">
            <Gift className="w-8 h-8 text-purple-600" />
          </div>
          <h2 className="text-lg font-semibold text-foreground mb-2">
            Módulo em construção
          </h2>
          <p className="text-muted-foreground max-w-sm mx-auto">
            A gestão de benefícios estará disponível em breve.
          </p>
        </CardContent>
      </Card>
    </div>
  );
};

export default BeneficiosPage;
