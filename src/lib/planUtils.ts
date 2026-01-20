export const PLANS = {
  essencial: {
    id: 'essencial',
    name: 'RH360 Essencial',
    price: 49.90,
    priceDisplay: '49,90',
    collaboratorLimit: 5,
    description: 'Ideal para pequenas empresas começando a digitalizar o RH',
    features: [
      'Cadastro de colaboradores',
      'Controle de férias básico',
      'Portal do colaborador',
      'Suporte por email',
    ],
    color: 'emerald',
    popular: false,
  },
  crescer: {
    id: 'crescer',
    name: 'RH360 Crescer',
    price: 99.90,
    priceDisplay: '99,90',
    collaboratorLimit: 10,
    description: 'Para empresas em crescimento que precisam de mais recursos',
    features: [
      'Tudo do Essencial',
      'Até 10 colaboradores',
      'Lançamentos financeiros',
      'Relatórios básicos',
      'Gestão de benefícios',
      'Suporte prioritário',
    ],
    color: 'blue',
    popular: false,
  },
  profissional: {
    id: 'profissional',
    name: 'RH360 Profissional',
    price: 199.90,
    priceDisplay: '199,90',
    collaboratorLimit: 30,
    description: 'Solução completa para médias empresas',
    features: [
      'Tudo do Crescer',
      'Até 30 colaboradores',
      'Folha de pagamento completa',
      'Integração contábil',
      'Relatórios avançados',
      'Gestão de lojas e equipes',
      'Contracheques digitais',
    ],
    color: 'violet',
    popular: true,
  },
  empresa_plus: {
    id: 'empresa_plus',
    name: 'RH360 Empresa+',
    price: 399.90,
    priceDisplay: '399,90',
    collaboratorLimit: 100,
    description: 'Para grandes operações com múltiplas unidades',
    features: [
      'Tudo do Profissional',
      'Até 100 colaboradores',
      'Multi-lojas ilimitadas',
      'API de integração',
      'Relatórios customizados',
      'Gerente de conta dedicado',
      'SLA garantido',
    ],
    color: 'amber',
    popular: false,
  },
} as const;

export type PlanId = keyof typeof PLANS;

export function getPlanById(planId: string) {
  return PLANS[planId as PlanId] || PLANS.essencial;
}

export function getPlanLimit(planId: string): number {
  const plan = getPlanById(planId);
  return plan.collaboratorLimit;
}

export function canAddCollaborator(planId: string, currentCount: number): boolean {
  const limit = getPlanLimit(planId);
  return currentCount < limit;
}

export function getUpgradeSuggestion(currentPlan: string): PlanId | null {
  const upgradeMap: Record<string, PlanId | null> = {
    essencial: 'crescer',
    crescer: 'profissional',
    profissional: 'empresa_plus',
    empresa_plus: null,
  };
  return upgradeMap[currentPlan] || null;
}

export function getSubscriptionStatusLabel(status: string): { label: string; variant: 'default' | 'secondary' | 'destructive' | 'outline' } {
  const statusMap: Record<string, { label: string; variant: 'default' | 'secondary' | 'destructive' | 'outline' }> = {
    active: { label: 'Ativo', variant: 'default' },
    pending: { label: 'Pendente', variant: 'secondary' },
    overdue: { label: 'Em atraso', variant: 'destructive' },
    cancelled: { label: 'Cancelado', variant: 'destructive' },
    expired: { label: 'Expirado', variant: 'outline' },
  };
  return statusMap[status] || { label: status, variant: 'outline' };
}