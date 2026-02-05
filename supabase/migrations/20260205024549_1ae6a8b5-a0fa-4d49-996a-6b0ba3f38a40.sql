-- Add new tax types to payroll_entry_type enum
ALTER TYPE payroll_entry_type ADD VALUE 'inss';
ALTER TYPE payroll_entry_type ADD VALUE 'fgts';
ALTER TYPE payroll_entry_type ADD VALUE 'irpf';