-- Add installment columns to payroll_entries
ALTER TABLE public.payroll_entries 
ADD COLUMN IF NOT EXISTS installment_group_id uuid DEFAULT NULL,
ADD COLUMN IF NOT EXISTS installment_number integer DEFAULT NULL,
ADD COLUMN IF NOT EXISTS installment_total integer DEFAULT NULL;

-- Create index for faster installment group queries
CREATE INDEX IF NOT EXISTS idx_payroll_entries_installment_group 
ON public.payroll_entries(installment_group_id) 
WHERE installment_group_id IS NOT NULL;