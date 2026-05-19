// Marca do sistema: DNA Softcom (antigo SoftHouse).
// Usa o ícone Dna do Phosphor sobre um quadrado com gradient-hero (laranja).
//
// Compatibilidade: `SoftHouseLogo` continua exportado como alias deprecated
// pra não quebrar imports antigos enquanto não migra. Remover quando todas as
// chamadas usarem `BrandLogo`.

import { Dna } from "@phosphor-icons/react";

type Props = {
  size?: "sm" | "md" | "lg";
  className?: string;
  pulse?: boolean;
};

const SIZES = {
  sm: { box: "w-9 h-9 rounded-lg", icon: "w-5 h-5" },
  md: { box: "w-10 h-10 rounded-xl", icon: "w-5 h-5" },
  lg: { box: "w-12 h-12 rounded-xl", icon: "w-6 h-6" },
} as const;

export function BrandLogo({ size = "md", className, pulse = false }: Props) {
  const s = SIZES[size];
  return (
    <div
      className={`${s.box} shrink-0 aspect-square gradient-hero flex items-center justify-center shadow-soft ${
        pulse ? "animate-pulse" : ""
      } ${className ?? ""}`}
      aria-label="DNA Softcom"
    >
      <Dna
        weight="bold"
        className={`${s.icon} text-primary-foreground`}
      />
    </div>
  );
}

/** @deprecated use `BrandLogo` */
export const SoftHouseLogo = BrandLogo;
