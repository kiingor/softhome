// Visualizações dos resultados: gráfico DISC (4 barras) + gráfico
// BigFive (5 barras horizontais) + cartões de análise.

import { CheckCircle, Trophy, Warning, Compass } from "@phosphor-icons/react";
import {
  buildDiscAnalysis,
  DISC_LABELS,
  DISC_COLORS,
  DISC_BG_COLORS,
  DISC_TEXT_COLORS,
  type DiscFactor,
} from "../lib/tests/disc-analysis";
import {
  buildBigFiveAnalysis,
  TRAIT_LABELS,
  TRAIT_FULL_NAMES,
  TRAIT_COLORS,
  TRAIT_TEXT_COLORS,
  interpretTrait,
  type Trait,
} from "../lib/tests/bigfive-analysis";

// ─────────────────────────────────────────────────────────────────────────────
// DISC: 4 barras verticais + análise interpretativa
// ─────────────────────────────────────────────────────────────────────────────

interface DiscChartProps {
  counts: Record<DiscFactor, number>;
}

export function DiscChart({ counts }: DiscChartProps) {
  const analysis = buildDiscAnalysis(counts);
  const factors: DiscFactor[] = ["D", "I", "S", "C"];

  return (
    <div className="space-y-6">
      {/* Gráfico de barras */}
      <div className="rounded-xl border border-border bg-gradient-to-br from-primary/5 via-background to-primary/5 p-6">
        <div className="text-center mb-4">
          <h3 className="font-display text-lg text-foreground">Perfil DISC</h3>
          <p className="text-xs text-muted-foreground uppercase tracking-widest">
            Resumo Gráfico
          </p>
        </div>

        <div className="relative h-56 flex items-end justify-center gap-4 sm:gap-6 mt-10">
          {factors.map((f) => {
            const pct = analysis.pct[f];
            return (
              <div key={f} className="flex flex-col items-center flex-1 max-w-[64px] h-full">
                <div className={`w-full ${DISC_BG_COLORS[f]} rounded-t-lg relative h-full flex items-end`}>
                  <div
                    className={`w-full ${DISC_COLORS[f]} rounded-t-lg relative transition-all duration-1000 ease-out`}
                    style={{ height: `${pct}%` }}
                  >
                    <div
                      className={`absolute -top-7 left-1/2 -translate-x-1/2 font-bold text-sm ${DISC_TEXT_COLORS[f]}`}
                    >
                      {pct}%
                    </div>
                  </div>
                </div>
                <div className={`mt-2 font-bold text-base ${DISC_TEXT_COLORS[f]}`}>
                  {f}
                </div>
              </div>
            );
          })}
        </div>

        <div className="mt-6 pt-4 border-t flex items-center justify-between text-xs">
          <span className="text-muted-foreground">Intensidade:</span>
          <span className="font-medium text-foreground">{analysis.intensity}</span>
        </div>
      </div>

      {/* Pontos brutos */}
      <div className="rounded-xl border border-border bg-card p-4">
        <p className="text-xs font-medium text-muted-foreground mb-2">
          Pontos brutos (de 40)
        </p>
        <div className="grid grid-cols-4 gap-2 text-center">
          {factors.map((f) => (
            <div key={f}>
              <span className={`block text-[10px] uppercase ${DISC_TEXT_COLORS[f]}`}>
                {f}
              </span>
              <span className={`block text-2xl font-bold ${DISC_TEXT_COLORS[f]} tabular-nums`}>
                {analysis.raw[f]}
              </span>
            </div>
          ))}
        </div>
      </div>

      {/* Análise interpretativa */}
      <div className="space-y-3">
        <div>
          <div className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-700 text-[10px] font-semibold uppercase tracking-wide">
            <CheckCircle className="w-3 h-3" weight="fill" />
            Análise Concluída
          </div>
          <h2 className="font-display text-2xl sm:text-3xl text-foreground mt-2 leading-tight">
            {analysis.summary.split(".")[0].replace(/^'/, "").replace(/'$/, "")}
          </h2>
          <p className="text-sm text-muted-foreground mt-2 leading-relaxed">
            {analysis.summary.split(".").slice(1).join(".").trim()}
          </p>
        </div>

        <div className="rounded-xl border border-border bg-card p-5">
          <h3 className="font-display text-base mb-3 flex items-center gap-2">
            <Trophy className="w-4 h-4 text-primary" weight="duotone" />
            Forças no trabalho
          </h3>
          <ul className="space-y-2 text-sm">
            {analysis.strengths.map((s, i) => (
              <li key={i} className="flex items-start gap-2">
                <CheckCircle className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" weight="fill" />
                <span>{s}</span>
              </li>
            ))}
          </ul>
        </div>

        <div className="rounded-xl border border-border bg-card p-5">
          <h3 className="font-display text-base mb-3 flex items-center gap-2">
            <Warning className="w-4 h-4 text-amber-600" weight="duotone" />
            Pontos de atenção
          </h3>
          <ul className="space-y-2 text-sm">
            {analysis.watchouts.map((s, i) => (
              <li key={i} className="flex items-start gap-2">
                <span className="w-1.5 h-1.5 rounded-full bg-amber-600 shrink-0 mt-2" />
                <span>{s}</span>
              </li>
            ))}
          </ul>
        </div>

        <div className="rounded-xl bg-foreground text-background p-5">
          <h3 className="font-display text-base mb-2 flex items-center gap-2">
            <Compass className="w-4 h-4" weight="duotone" />
            Posicionamento sugerido (Recrutamento)
          </h3>
          <p className="text-sm leading-relaxed opacity-95">
            {analysis.positioning}
          </p>
        </div>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// BigFive: 5 barras horizontais + interpretação por traço
// ─────────────────────────────────────────────────────────────────────────────

interface BigFiveChartProps {
  scores: Record<Trait, number>;
}

const LEVEL_BADGE_COLORS = {
  Baixo: "bg-slate-100 text-slate-700",
  Médio: "bg-blue-100 text-blue-700",
  Alto: "bg-emerald-100 text-emerald-700",
};

export function BigFiveChart({ scores }: BigFiveChartProps) {
  const analysis = buildBigFiveAnalysis(scores);
  const traits: Trait[] = ["O", "C", "E", "A", "N"];

  return (
    <div className="space-y-6">
      {/* Headline */}
      <div className="rounded-xl border border-border bg-gradient-to-br from-primary/5 via-background to-primary/5 p-6 space-y-3">
        <div className="text-center">
          <h3 className="font-display text-lg text-foreground">Perfil BigFive (OCEAN)</h3>
          <p className="text-xs text-muted-foreground uppercase tracking-widest mt-1">
            Os 5 grandes traços de personalidade
          </p>
        </div>
        <p className="text-sm text-center text-muted-foreground">{analysis.headline}</p>
      </div>

      {/* Barras horizontais */}
      <div className="space-y-3">
        {traits.map((t) => {
          const score = scores[t];
          const interp = interpretTrait(t, score);
          return (
            <div key={t} className="rounded-xl border border-border bg-card p-4 space-y-2">
              <div className="flex items-center justify-between gap-2 flex-wrap">
                <div className="flex items-center gap-2 min-w-0">
                  <span className={`font-mono text-xs font-bold ${TRAIT_TEXT_COLORS[t]}`}>{t}</span>
                  <span className="font-semibold text-foreground text-sm">{TRAIT_LABELS[t]}</span>
                  <span className={`text-[10px] px-1.5 py-0.5 rounded font-medium ${LEVEL_BADGE_COLORS[interp.level]}`}>
                    {interp.level}
                  </span>
                </div>
                <span className={`tabular-nums font-bold ${TRAIT_TEXT_COLORS[t]}`}>
                  {score}%
                </span>
              </div>
              <div className="h-3 rounded-full bg-muted overflow-hidden">
                <div
                  className={`h-full ${TRAIT_COLORS[t]} rounded-full transition-all duration-1000 ease-out`}
                  style={{ width: `${score}%` }}
                />
              </div>
              <p className="text-xs text-muted-foreground leading-relaxed pt-1">
                {interp.reading}
              </p>
              <p className="text-[10px] text-muted-foreground/70 italic">
                {TRAIT_FULL_NAMES[t]}
              </p>
            </div>
          );
        })}
      </div>
    </div>
  );
}
