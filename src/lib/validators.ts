// Validate Brazilian CPF format (structure only, not checksum)
export const validateCPF = (cpf: string): boolean => {
  // Remove non-numeric characters
  const cleanCPF = cpf.replace(/\D/g, "");
  
  // Must have 11 digits
  if (cleanCPF.length !== 11) return false;
  
  // Check for known invalid patterns (all same digits)
  if (/^(\d)\1{10}$/.test(cleanCPF)) return false;
  
  // Validate first check digit
  let sum = 0;
  for (let i = 0; i < 9; i++) {
    sum += parseInt(cleanCPF.charAt(i)) * (10 - i);
  }
  let remainder = (sum * 10) % 11;
  if (remainder === 10 || remainder === 11) remainder = 0;
  if (remainder !== parseInt(cleanCPF.charAt(9))) return false;
  
  // Validate second check digit
  sum = 0;
  for (let i = 0; i < 10; i++) {
    sum += parseInt(cleanCPF.charAt(i)) * (11 - i);
  }
  remainder = (sum * 10) % 11;
  if (remainder === 10 || remainder === 11) remainder = 0;
  if (remainder !== parseInt(cleanCPF.charAt(10))) return false;
  
  return true;
};

// Format CPF for display (XXX.XXX.XXX-XX)
export const formatCPF = (cpf: string): string => {
  const cleanCPF = cpf.replace(/\D/g, "");
  if (cleanCPF.length !== 11) return cpf;
  return cleanCPF.replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, "$1.$2.$3-$4");
};

// Format CPF as user types (for input mask)
export const formatCPFInput = (value: string): string => {
  const digits = value.replace(/\D/g, "").slice(0, 11);
  return digits
    .replace(/(\d{3})(\d)/, "$1.$2")
    .replace(/(\d{3})(\d)/, "$1.$2")
    .replace(/(\d{3})(\d{1,2})$/, "$1-$2");
};

// Remove CPF formatting
export const cleanCPF = (cpf: string): string => {
  return cpf.replace(/\D/g, "");
};

// Format phone number
export const formatPhone = (phone: string): string => {
  const cleanPhone = phone.replace(/\D/g, "");
  if (cleanPhone.length === 11) {
    return cleanPhone.replace(/(\d{2})(\d{5})(\d{4})/, "($1) $2-$3");
  }
  if (cleanPhone.length === 10) {
    return cleanPhone.replace(/(\d{2})(\d{4})(\d{4})/, "($1) $2-$3");
  }
  return phone;
};

// Format phone as user types (for input mask)
export const formatPhoneInput = (value: string): string => {
  const digits = value.replace(/\D/g, "").slice(0, 11);
  if (digits.length <= 2) return digits;
  if (digits.length <= 7) {
    return digits.replace(/(\d{2})(\d{0,5})/, "($1) $2");
  }
  if (digits.length <= 10) {
    return digits.replace(/(\d{2})(\d{4})(\d{0,4})/, "($1) $2-$3");
  }
  return digits.replace(/(\d{2})(\d{5})(\d{0,4})/, "($1) $2-$3");
};

// Validate Brazilian CNPJ (full checksum, 14 digits)
export const validateCNPJ = (cnpj: string): boolean => {
  const clean = cnpj.replace(/\D/g, "");
  if (clean.length !== 14) return false;
  if (/^(\d)\1{13}$/.test(clean)) return false;

  const calcDigit = (base: string, weights: number[]): number => {
    const sum = base
      .split("")
      .reduce((acc, d, i) => acc + parseInt(d) * weights[i], 0);
    const remainder = sum % 11;
    return remainder < 2 ? 0 : 11 - remainder;
  };

  const w1 = [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2];
  const w2 = [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2];
  const d1 = calcDigit(clean.slice(0, 12), w1);
  if (d1 !== parseInt(clean.charAt(12))) return false;
  const d2 = calcDigit(clean.slice(0, 13), w2);
  return d2 === parseInt(clean.charAt(13));
};

// Format CNPJ for display (XX.XXX.XXX/XXXX-XX)
export const formatCNPJ = (cnpj: string): string => {
  const clean = cnpj.replace(/\D/g, "");
  if (clean.length !== 14) return cnpj;
  return clean.replace(/(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})/, "$1.$2.$3/$4-$5");
};
