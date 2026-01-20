-- 1) Adicionar coluna position_id na tabela collaborators para referenciar cargos
ALTER TABLE public.collaborators 
  ADD COLUMN IF NOT EXISTS position_id UUID REFERENCES public.positions(id) ON DELETE SET NULL;

-- 2) Adicionar campos de valor e configuração de benefícios
ALTER TABLE public.benefits
  ADD COLUMN IF NOT EXISTS value NUMERIC(12,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS value_type TEXT NOT NULL DEFAULT 'monthly',
  ADD COLUMN IF NOT EXISTS applicable_days TEXT[] DEFAULT ARRAY['mon','tue','wed','thu','fri'];

-- 3) Adicionar constraint de value_type
ALTER TABLE public.benefits
  ADD CONSTRAINT benefits_value_type_check 
  CHECK (value_type IN ('monthly', 'daily'));

-- 4) Criar índice para position_id
CREATE INDEX IF NOT EXISTS idx_collaborators_position_id ON public.collaborators(position_id);