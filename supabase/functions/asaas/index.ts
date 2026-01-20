import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const ASAAS_API_URL = 'https://api.asaas.com/v3';

interface AsaasCustomer {
  id: string;
  name: string;
  email: string;
  cpfCnpj?: string;
}

interface AsaasSubscription {
  id: string;
  customer: string;
  value: number;
  nextDueDate: string;
  status: string;
}

// Plan pricing configuration
const PLAN_PRICING = {
  essencial: { value: 49.90, description: 'RH360 Essencial - Até 5 colaboradores' },
  crescer: { value: 99.90, description: 'RH360 Crescer - Até 10 colaboradores' },
  profissional: { value: 199.90, description: 'RH360 Profissional - Até 30 colaboradores' },
  empresa_plus: { value: 399.90, description: 'RH360 Empresa+ - Até 100 colaboradores' },
};

async function asaasRequest(endpoint: string, options: RequestInit = {}) {
  const apiKey = Deno.env.get('ASAAS_API_KEY');
  if (!apiKey) {
    throw new Error('ASAAS_API_KEY not configured');
  }

  const response = await fetch(`${ASAAS_API_URL}${endpoint}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      'access_token': apiKey,
      ...options.headers,
    },
  });

  const data = await response.json();
  
  if (!response.ok) {
    console.error('Asaas API error:', data);
    throw new Error(data.errors?.[0]?.description || 'Asaas API error');
  }

  return data;
}

// Create customer in Asaas
async function createCustomer(name: string, email: string, cpfCnpj?: string): Promise<AsaasCustomer> {
  console.log('Creating Asaas customer:', { name, email });
  
  return await asaasRequest('/customers', {
    method: 'POST',
    body: JSON.stringify({
      name,
      email,
      cpfCnpj,
      notificationDisabled: false,
    }),
  });
}

// Create subscription in Asaas
async function createSubscription(customerId: string, plan: string): Promise<AsaasSubscription> {
  const planConfig = PLAN_PRICING[plan as keyof typeof PLAN_PRICING] || PLAN_PRICING.essencial;
  
  console.log('Creating Asaas subscription:', { customerId, plan, value: planConfig.value });
  
  // Calculate next due date (first day of next month)
  const now = new Date();
  const nextDueDate = new Date(now.getFullYear(), now.getMonth() + 1, 1);
  
  return await asaasRequest('/subscriptions', {
    method: 'POST',
    body: JSON.stringify({
      customer: customerId,
      billingType: 'BOLETO',
      value: planConfig.value,
      nextDueDate: nextDueDate.toISOString().split('T')[0],
      description: planConfig.description,
      cycle: 'MONTHLY',
    }),
  });
}

// Update subscription plan
async function updateSubscription(subscriptionId: string, plan: string): Promise<AsaasSubscription> {
  const planConfig = PLAN_PRICING[plan as keyof typeof PLAN_PRICING];
  if (!planConfig) throw new Error('Invalid plan');
  
  console.log('Updating Asaas subscription:', { subscriptionId, plan, value: planConfig.value });
  
  return await asaasRequest(`/subscriptions/${subscriptionId}`, {
    method: 'PUT',
    body: JSON.stringify({
      value: planConfig.value,
      description: planConfig.description,
    }),
  });
}

// Cancel subscription
async function cancelSubscription(subscriptionId: string): Promise<void> {
  console.log('Canceling Asaas subscription:', subscriptionId);
  
  await asaasRequest(`/subscriptions/${subscriptionId}`, {
    method: 'DELETE',
  });
}

// Get subscription status
async function getSubscription(subscriptionId: string): Promise<AsaasSubscription> {
  return await asaasRequest(`/subscriptions/${subscriptionId}`);
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    const { action, ...params } = await req.json();
    console.log('Asaas action:', action, params);

    let result;

    switch (action) {
      case 'create_customer': {
        const { name, email, cpfCnpj, companyId } = params;
        const customer = await createCustomer(name, email, cpfCnpj);
        
        // Update company with Asaas customer ID
        await supabase
          .from('companies')
          .update({ asaas_customer_id: customer.id })
          .eq('id', companyId);
        
        result = customer;
        break;
      }

      case 'create_subscription': {
        const { customerId, plan, companyId } = params;
        const subscription = await createSubscription(customerId, plan);
        
        // Update company with subscription info
        await supabase
          .from('companies')
          .update({ 
            asaas_subscription_id: subscription.id,
            subscription_status: subscription.status.toLowerCase(),
            subscription_due_date: subscription.nextDueDate,
          })
          .eq('id', companyId);
        
        result = subscription;
        break;
      }

      case 'update_plan': {
        const { subscriptionId, newPlan, companyId, changedBy, previousPlan } = params;
        const subscription = await updateSubscription(subscriptionId, newPlan);
        
        // Update company plan
        await supabase
          .from('companies')
          .update({ 
            plan_type: newPlan,
            subscription_status: subscription.status.toLowerCase(),
          })
          .eq('id', companyId);
        
        // Record history
        await supabase
          .from('subscription_history')
          .insert({
            company_id: companyId,
            previous_plan: previousPlan,
            new_plan: newPlan,
            changed_by: changedBy,
            change_reason: 'Plan upgrade/downgrade',
          });
        
        result = subscription;
        break;
      }

      case 'cancel_subscription': {
        const { subscriptionId, companyId, changedBy } = params;
        await cancelSubscription(subscriptionId);
        
        // Get current plan for history
        const { data: company } = await supabase
          .from('companies')
          .select('plan_type')
          .eq('id', companyId)
          .single();
        
        // Update company status
        await supabase
          .from('companies')
          .update({ 
            subscription_status: 'cancelled',
            is_blocked: true,
          })
          .eq('id', companyId);
        
        // Record history
        await supabase
          .from('subscription_history')
          .insert({
            company_id: companyId,
            previous_plan: company?.plan_type,
            new_plan: 'cancelled',
            changed_by: changedBy,
            change_reason: 'Subscription cancelled',
          });
        
        result = { success: true };
        break;
      }

      case 'get_subscription': {
        const { subscriptionId } = params;
        result = await getSubscription(subscriptionId);
        break;
      }

      case 'block_company': {
        const { companyId, blocked, changedBy } = params;
        
        await supabase
          .from('companies')
          .update({ is_blocked: blocked })
          .eq('id', companyId);
        
        result = { success: true, blocked };
        break;
      }

      case 'sync_status': {
        const { subscriptionId, companyId } = params;
        const subscription = await getSubscription(subscriptionId);
        
        await supabase
          .from('companies')
          .update({ 
            subscription_status: subscription.status.toLowerCase(),
            subscription_due_date: subscription.nextDueDate,
          })
          .eq('id', companyId);
        
        result = subscription;
        break;
      }

      default:
        throw new Error(`Unknown action: ${action}`);
    }

    return new Response(JSON.stringify(result), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    console.error('Asaas function error:', error);
    return new Response(
      JSON.stringify({ error: errorMessage }),
      { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});