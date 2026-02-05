-- Add tax percentage columns to positions table
ALTER TABLE public.positions 
ADD COLUMN IF NOT EXISTS inss_percent numeric(5,2) DEFAULT 0,
ADD COLUMN IF NOT EXISTS fgts_percent numeric(5,2) DEFAULT 0,
ADD COLUMN IF NOT EXISTS irpf_percent numeric(5,2) DEFAULT 0;