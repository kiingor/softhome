import { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { supabase } from "@/integrations/supabase/client";
import { useDashboard } from "@/contexts/DashboardContext";
import { toast } from "sonner";
import { Loader2, CreditCard, Lock, Shield } from "lucide-react";
import { PLANS, PlanId } from "@/lib/planUtils";

interface PaymentModalProps {
  open: boolean;
  onClose: () => void;
  planId: PlanId;
  onSuccess: () => void;
}

// Formatting helpers
const formatCardNumber = (value: string) => {
  const numbers = value.replace(/\D/g, "");
  return numbers.replace(/(\d{4})(?=\d)/g, "$1 ").slice(0, 19);
};

const formatExpiry = (value: string) => {
  const numbers = value.replace(/\D/g, "");
  if (numbers.length >= 2) {
    return `${numbers.slice(0, 2)}/${numbers.slice(2, 4)}`;
  }
  return numbers;
};

const formatCPFCNPJ = (value: string) => {
  const numbers = value.replace(/\D/g, "");
  if (numbers.length <= 11) {
    return numbers
      .replace(/(\d{3})(\d)/, "$1.$2")
      .replace(/(\d{3})(\d)/, "$1.$2")
      .replace(/(\d{3})(\d{1,2})$/, "$1-$2");
  }
  return numbers
    .replace(/^(\d{2})(\d)/, "$1.$2")
    .replace(/^(\d{2})\.(\d{3})(\d)/, "$1.$2.$3")
    .replace(/\.(\d{3})(\d)/, ".$1/$2")
    .replace(/(\d{4})(\d)/, "$1-$2")
    .slice(0, 18);
};

const formatPhone = (value: string) => {
  const numbers = value.replace(/\D/g, "");
  if (numbers.length <= 10) {
    return numbers
      .replace(/^(\d{2})(\d)/, "($1) $2")
      .replace(/(\d{4})(\d)/, "$1-$2");
  }
  return numbers
    .replace(/^(\d{2})(\d)/, "($1) $2")
    .replace(/(\d{5})(\d)/, "$1-$2")
    .slice(0, 15);
};

const formatCEP = (value: string) => {
  const numbers = value.replace(/\D/g, "");
  return numbers.replace(/^(\d{5})(\d)/, "$1-$2").slice(0, 9);
};

export function PaymentModal({ open, onClose, planId, onSuccess }: PaymentModalProps) {
  const { currentCompany, user } = useDashboard();
  const planInfo = PLANS[planId];
  
  // Card data
  const [cardNumber, setCardNumber] = useState("");
  const [holderName, setHolderName] = useState("");
  const [expiry, setExpiry] = useState("");
  const [cvv, setCvv] = useState("");
  
  // Holder data
  const [cpfCnpj, setCpfCnpj] = useState("");
  const [email, setEmail] = useState(user?.email || "");
  const [phone, setPhone] = useState("");
  const [postalCode, setPostalCode] = useState("");
  const [addressNumber, setAddressNumber] = useState("");
  
  const [isLoading, setIsLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!currentCompany?.id) {
      toast.error("Empresa não encontrada");
      return;
    }

    // Basic validation
    if (cardNumber.replace(/\D/g, "").length < 16) {
      toast.error("Número do cartão inválido");
      return;
    }
    if (!holderName.trim()) {
      toast.error("Nome do titular é obrigatório");
      return;
    }
    if (expiry.length < 5) {
      toast.error("Data de validade inválida");
      return;
    }
    if (cvv.length < 3) {
      toast.error("CVV inválido");
      return;
    }
    if (cpfCnpj.replace(/\D/g, "").length < 11) {
      toast.error("CPF/CNPJ inválido");
      return;
    }
    if (postalCode.replace(/\D/g, "").length < 8) {
      toast.error("CEP inválido");
      return;
    }

    setIsLoading(true);

    try {
      const [expiryMonth, expiryYear] = expiry.split("/");
      const fullYear = `20${expiryYear}`;

      // Step 1: Create or update customer in Asaas
      let customerId = currentCompany.asaas_customer_id;
      
      if (!customerId) {
        const { data: customerResult, error: customerError } = await supabase.functions.invoke("asaas", {
          body: {
            action: "create_customer",
            name: currentCompany.company_name,
            email: email,
            cpfCnpj: cpfCnpj.replace(/\D/g, ""),
            companyId: currentCompany.id,
          },
        });
        
        if (customerError) throw new Error(customerError.message);
        if (customerResult?.error) throw new Error(customerResult.error);
        customerId = customerResult.id;
      }

      // Step 2: Create subscription with credit card
      const { data: subscriptionResult, error: subscriptionError } = await supabase.functions.invoke("asaas", {
        body: {
          action: "create_subscription_credit_card",
          customerId,
          plan: planId,
          companyId: currentCompany.id,
          creditCard: {
            holderName,
            number: cardNumber.replace(/\D/g, ""),
            expiryMonth,
            expiryYear: fullYear,
            ccv: cvv,
          },
          creditCardHolderInfo: {
            name: holderName,
            email,
            cpfCnpj: cpfCnpj.replace(/\D/g, ""),
            postalCode: postalCode.replace(/\D/g, ""),
            addressNumber,
            phone: phone.replace(/\D/g, ""),
          },
        },
      });

      if (subscriptionError) throw new Error(subscriptionError.message);
      if (subscriptionResult?.error) throw new Error(subscriptionResult.error);

      toast.success("Assinatura realizada com sucesso! 🎉");
      onSuccess();
    } catch (error: any) {
      console.error("Payment error:", error);
      toast.error(error.message || "Erro ao processar pagamento. Verifique os dados e tente novamente.");
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <CreditCard className="w-5 h-5 text-primary" />
            Assinar Plano {planInfo.name}
          </DialogTitle>
          <DialogDescription>
            R$ {planInfo.price.toFixed(2).replace(".", ",")}/mês • Cobrança mensal no cartão de crédito
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-6">
          {/* Card Data */}
          <div className="space-y-4">
            <h3 className="font-medium text-sm text-foreground flex items-center gap-2">
              <Lock className="w-4 h-4" />
              Dados do Cartão
            </h3>
            
            <div className="space-y-2">
              <Label htmlFor="cardNumber">Número do Cartão</Label>
              <Input
                id="cardNumber"
                placeholder="0000 0000 0000 0000"
                value={cardNumber}
                onChange={(e) => setCardNumber(formatCardNumber(e.target.value))}
                maxLength={19}
                required
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="holderName">Nome no Cartão</Label>
              <Input
                id="holderName"
                placeholder="NOME COMO ESTÁ NO CARTÃO"
                value={holderName}
                onChange={(e) => setHolderName(e.target.value.toUpperCase())}
                required
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="expiry">Validade</Label>
                <Input
                  id="expiry"
                  placeholder="MM/AA"
                  value={expiry}
                  onChange={(e) => setExpiry(formatExpiry(e.target.value))}
                  maxLength={5}
                  required
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="cvv">CVV</Label>
                <Input
                  id="cvv"
                  placeholder="000"
                  value={cvv}
                  onChange={(e) => setCvv(e.target.value.replace(/\D/g, "").slice(0, 4))}
                  maxLength={4}
                  type="password"
                  required
                />
              </div>
            </div>
          </div>

          <Separator />

          {/* Holder Data */}
          <div className="space-y-4">
            <h3 className="font-medium text-sm text-foreground">Dados do Titular</h3>
            
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="cpfCnpj">CPF/CNPJ</Label>
                <Input
                  id="cpfCnpj"
                  placeholder="000.000.000-00"
                  value={cpfCnpj}
                  onChange={(e) => setCpfCnpj(formatCPFCNPJ(e.target.value))}
                  maxLength={18}
                  required
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="phone">Telefone</Label>
                <Input
                  id="phone"
                  placeholder="(00) 00000-0000"
                  value={phone}
                  onChange={(e) => setPhone(formatPhone(e.target.value))}
                  maxLength={15}
                  required
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="email">E-mail</Label>
              <Input
                id="email"
                type="email"
                placeholder="email@empresa.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="postalCode">CEP</Label>
                <Input
                  id="postalCode"
                  placeholder="00000-000"
                  value={postalCode}
                  onChange={(e) => setPostalCode(formatCEP(e.target.value))}
                  maxLength={9}
                  required
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="addressNumber">Número</Label>
                <Input
                  id="addressNumber"
                  placeholder="123"
                  value={addressNumber}
                  onChange={(e) => setAddressNumber(e.target.value)}
                  required
                />
              </div>
            </div>
          </div>

          <div className="flex items-center gap-2 p-3 rounded-lg bg-muted/50 text-sm text-muted-foreground">
            <Shield className="w-4 h-4 shrink-0" />
            <span>Seus dados estão protegidos com criptografia de ponta a ponta.</span>
          </div>

          <div className="flex gap-3">
            <Button
              type="button"
              variant="outline"
              className="flex-1"
              onClick={onClose}
              disabled={isLoading}
            >
              Cancelar
            </Button>
            <Button type="submit" className="flex-1" disabled={isLoading}>
              {isLoading ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  Processando...
                </>
              ) : (
                <>
                  <CreditCard className="w-4 h-4 mr-2" />
                  Assinar Agora
                </>
              )}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
