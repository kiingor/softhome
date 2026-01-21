import { useState } from "react";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { supabase } from "@/integrations/supabase/client";
import { useDashboard } from "@/contexts/DashboardContext";
import { toast } from "sonner";
import { Loader2, CreditCard, Lock, Check, X } from "lucide-react";
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
      <DialogContent className="max-w-4xl p-0 overflow-hidden border-0 gap-0">
        <div className="grid md:grid-cols-2 min-h-[600px]">
          {/* Left Side - Plan Summary */}
          <div className="bg-primary p-8 text-primary-foreground flex flex-col">
            {/* Close button for mobile */}
            <button 
              onClick={onClose}
              className="absolute top-4 left-4 md:hidden p-2 rounded-full hover:bg-primary-foreground/10 transition-colors"
            >
              <X className="w-5 h-5" />
            </button>

            <div className="flex-1">
              <div className="mb-8">
                <p className="text-primary-foreground/70 text-sm mb-1">Assinar</p>
                <h2 className="text-xl font-semibold">{planInfo.name}</h2>
                <div className="mt-4">
                  <span className="text-4xl font-bold">R$ {planInfo.priceDisplay}</span>
                  <span className="text-primary-foreground/70">/mês</span>
                </div>
              </div>

              {/* Plan Details */}
              <div className="space-y-4 border-t border-primary-foreground/20 pt-6">
                <div className="flex justify-between text-sm">
                  <span className="text-primary-foreground/70">{planInfo.name}</span>
                  <span>R$ {planInfo.priceDisplay}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-primary-foreground/70">Colaboradores</span>
                  <span>Até {planInfo.collaboratorLimit}</span>
                </div>
              </div>

              {/* Features */}
              <div className="mt-6 space-y-3">
                <p className="text-sm text-primary-foreground/70 font-medium">Incluso no plano:</p>
                {planInfo.features.map((feature, index) => (
                  <div key={index} className="flex items-center gap-2 text-sm">
                    <Check className="w-4 h-4 shrink-0" />
                    <span>{feature}</span>
                  </div>
                ))}
              </div>

              {/* Total */}
              <div className="mt-auto pt-6 border-t border-primary-foreground/20">
                <div className="flex justify-between items-center">
                  <span className="font-semibold">Total mensal</span>
                  <span className="text-2xl font-bold">R$ {planInfo.priceDisplay}</span>
                </div>
              </div>
            </div>

            <div className="mt-6 flex items-center gap-2 text-primary-foreground/60 text-xs">
              <Lock className="w-3 h-3" />
              <span>Pagamento seguro via Asaas</span>
            </div>
          </div>

          {/* Right Side - Payment Form */}
          <div className="bg-background p-8 flex flex-col">
            {/* Close button */}
            <button 
              onClick={onClose}
              className="absolute top-4 right-4 p-2 rounded-full hover:bg-muted transition-colors text-muted-foreground"
            >
              <X className="w-5 h-5" />
            </button>

            <form onSubmit={handleSubmit} className="flex-1 flex flex-col overflow-y-auto">
              <h3 className="text-lg font-semibold mb-6">Dados de pagamento</h3>

              {/* Billing Information - First */}
              <div className="space-y-3 mb-5">
                <Label className="text-sm font-medium">Dados de cobrança</Label>
                <Input
                  placeholder="Nome completo do titular"
                  value={holderName}
                  onChange={(e) => setHolderName(e.target.value.toUpperCase())}
                  className="h-11"
                  required
                />
                <Input
                  id="email"
                  type="email"
                  placeholder="E-mail"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="h-11"
                  required
                />
                <div className="grid grid-cols-2 gap-3">
                  <Input
                    placeholder="CPF ou CNPJ"
                    value={cpfCnpj}
                    onChange={(e) => setCpfCnpj(formatCPFCNPJ(e.target.value))}
                    maxLength={18}
                    className="h-11"
                    required
                  />
                  <Input
                    placeholder="Telefone"
                    value={phone}
                    onChange={(e) => setPhone(formatPhone(e.target.value))}
                    maxLength={15}
                    className="h-11"
                    required
                  />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <Input
                    placeholder="CEP"
                    value={postalCode}
                    onChange={(e) => setPostalCode(formatCEP(e.target.value))}
                    maxLength={9}
                    className="h-11"
                    required
                  />
                  <Input
                    placeholder="Número do endereço"
                    value={addressNumber}
                    onChange={(e) => setAddressNumber(e.target.value)}
                    className="h-11"
                    required
                  />
                </div>
              </div>

              {/* Card Information - Second */}
              <div className="space-y-3 mb-4">
                <Label className="text-sm font-medium">Dados do cartão</Label>
                <div className="border rounded-lg overflow-hidden focus-within:ring-2 focus-within:ring-ring">
                  <div className="relative">
                    <Input
                      placeholder="Número do cartão"
                      value={cardNumber}
                      onChange={(e) => setCardNumber(formatCardNumber(e.target.value))}
                      maxLength={19}
                      className="border-0 rounded-none h-11 pr-20 focus-visible:ring-0"
                      required
                    />
                    <div className="absolute right-3 top-1/2 -translate-y-1/2 flex gap-1">
                      <div className="w-8 h-5 bg-[#1A1F71] rounded flex items-center justify-center">
                        <span className="text-white text-[8px] font-bold">VISA</span>
                      </div>
                      <div className="w-8 h-5 bg-gradient-to-r from-[#EB001B] to-[#F79E1B] rounded flex items-center justify-center">
                        <div className="flex">
                          <div className="w-2.5 h-2.5 bg-[#EB001B] rounded-full opacity-80"></div>
                          <div className="w-2.5 h-2.5 bg-[#F79E1B] rounded-full -ml-1 opacity-80"></div>
                        </div>
                      </div>
                    </div>
                  </div>
                  <div className="flex border-t">
                    <Input
                      placeholder="MM/AA"
                      value={expiry}
                      onChange={(e) => setExpiry(formatExpiry(e.target.value))}
                      maxLength={5}
                      className="border-0 rounded-none h-11 border-r focus-visible:ring-0"
                      required
                    />
                    <Input
                      placeholder="CVV"
                      value={cvv}
                      onChange={(e) => setCvv(e.target.value.replace(/\D/g, "").slice(0, 4))}
                      maxLength={4}
                      type="password"
                      className="border-0 rounded-none h-11 focus-visible:ring-0"
                      required
                    />
                  </div>
                </div>
              </div>

              {/* Submit Button */}
              <div className="mt-auto pt-4">
                <Button 
                  type="submit" 
                  className="w-full h-12 text-base font-semibold"
                  disabled={isLoading}
                >
                  {isLoading ? (
                    <>
                      <Loader2 className="w-5 h-5 mr-2 animate-spin" />
                      Processando...
                    </>
                  ) : (
                    <>
                      <CreditCard className="w-5 h-5 mr-2" />
                      Pagar R$ {planInfo.priceDisplay}
                    </>
                  )}
                </Button>
              </div>

              {/* Security Note */}
              <div className="mt-4 flex items-center justify-center gap-2 text-xs text-muted-foreground">
                <Lock className="w-3 h-3" />
                <span>Seus dados estão protegidos com criptografia</span>
              </div>
            </form>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
