import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { usePortal } from "@/contexts/PortalContext";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Gift, Info } from "@phosphor-icons/react";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { formatCurrency, getCurrentCompetencia } from "@/lib/formatters";
import { calculateMonthlyBenefitValue, dayLabels, DayAbbrev } from "@/lib/workingDays";
import { useStoreHolidays } from "@/modules/payroll/hooks/use-store-holidays";

const MeusBeneficiosPage = () => {
  const { collaborator } = usePortal();
  const { month: currentMonth, year: currentYear } = getCurrentCompetencia();
  const { holidayDates } = useStoreHolidays(collaborator?.store_id ?? null, currentYear);

  // Fetch benefits assigned to the collaborator
  const { data: myBenefits = [], isLoading } = useQuery({
    queryKey: ["my-benefits", collaborator?.id],
    queryFn: async () => {
      if (!collaborator?.id) return [];
      const { data, error } = await supabase
        .from("benefits_assignments")
        .select(`
          *,
          benefit:benefits(id, name, description, value, value_type, applicable_days)
        `)
        .eq("collaborator_id", collaborator.id)
        .order("assigned_at", { ascending: false });
      if (error) throw error;
      return data;
    },
    enabled: !!collaborator?.id,
  });

  // Calculate monthly value for a benefit
  const getMonthlyValue = (benefit: any) => {
    if (!benefit) return 0;
    const valueType = (benefit.value_type || "monthly") as "monthly" | "daily";
    const applicableDays = (benefit.applicable_days || ["mon", "tue", "wed", "thu", "fri"]) as DayAbbrev[];
    return calculateMonthlyBenefitValue(
      benefit.value || 0,
      valueType,
      applicableDays,
      currentMonth,
      currentYear,
      holidayDates,
    );
  };

  // Format applicable days for display
  const formatApplicableDays = (days: string[] | null) => {
    if (!days || days.length === 0) return "";
    return days.map((d) => dayLabels[d as DayAbbrev] || d).join(", ");
  };

  if (!collaborator) {
    return (
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Meus Benefícios</h1>
          <p className="text-muted-foreground">Visualize seus benefícios</p>
        </div>
        <Card>
          <CardContent className="p-12 text-center">
            <div className="w-16 h-16 rounded-full bg-muted flex items-center justify-center mx-auto mb-4">
              <Info className="w-8 h-8 text-muted-foreground" />
            </div>
            <h2 className="text-lg font-semibold text-foreground mb-2">
              Perfil não vinculado
            </h2>
            <p className="text-muted-foreground max-w-sm mx-auto">
              Seu usuário ainda não está vinculado a um cadastro de colaborador.
              Entre em contato com o RH.
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-foreground">Meus Benefícios</h1>
        <p className="text-muted-foreground">
          Confira os benefícios atribuídos a você
        </p>
      </div>

      {isLoading ? (
        <div className="text-center py-8 text-muted-foreground">
          Carregando...
        </div>
      ) : myBenefits.length === 0 ? (
        <Card>
          <CardContent className="p-12 text-center">
            <div className="w-16 h-16 rounded-full bg-muted flex items-center justify-center mx-auto mb-4">
              <Gift className="w-8 h-8 text-muted-foreground" />
            </div>
            <h2 className="text-lg font-semibold text-foreground mb-2">
              Nenhum benefício atribuído
            </h2>
            <p className="text-muted-foreground max-w-sm mx-auto">
              Você ainda não possui benefícios cadastrados. Entre em contato com o RH
              para mais informações.
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {myBenefits.map((item: any) => (
            <Card key={item.id} className="hover:shadow-md transition-shadow">
              <CardHeader className="pb-2">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center">
                    <Gift className="w-5 h-5 text-primary" />
                  </div>
                  <CardTitle className="text-base">
                    {item.benefit?.name}
                  </CardTitle>
                </div>
              </CardHeader>
              <CardContent className="space-y-3">
                {/* Valor do benefício */}
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-2xl font-bold text-primary">
                      {formatCurrency(getMonthlyValue(item.benefit))}
                    </span>
                    <Badge variant="outline">
                      {item.benefit?.value_type === "daily" ? "Por dia" : "Mensal"}
                    </Badge>
                  </div>
                  
                  {/* Show calculation for daily benefits */}
                  {item.benefit?.value_type === "daily" && (
                    <div className="text-sm text-muted-foreground bg-muted/50 rounded-md p-2">
                      <p>{formatCurrency(item.benefit.value || 0)} × dias úteis do mês</p>
                      <p className="text-xs mt-1">
                        Dias: {formatApplicableDays(item.benefit.applicable_days)}
                      </p>
                    </div>
                  )}
                </div>

                {item.benefit?.description && (
                  <p className="text-sm text-muted-foreground">
                    {item.benefit.description}
                  </p>
                )}
                {item.observation && (
                  <div className="bg-muted/50 rounded-lg p-3">
                    <p className="text-sm text-foreground">
                      <span className="font-medium">Observação:</span>{" "}
                      {item.observation}
                    </p>
                  </div>
                )}
                <div className="flex items-center justify-between pt-2 border-t">
                  <Badge variant="secondary">Ativo</Badge>
                  <span className="text-xs text-muted-foreground">
                    Desde{" "}
                    {format(new Date(item.assigned_at), "dd/MM/yyyy", {
                      locale: ptBR,
                    })}
                  </span>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
};

export default MeusBeneficiosPage;
