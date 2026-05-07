import confetti from "canvas-confetti";
import { toast } from "sonner";

type CelebrationOptions = {
  title: string;
  body?: string;
  durationMs?: number;
};

const ORANGE_PALETTE = ["#F97316", "#FB923C", "#FDBA74", "#FFEDD5", "#EA580C"];

/** Dispara animação de confetti vinda do topo da tela. */
export function fireConfetti(durationMs = 1500) {
  const end = Date.now() + durationMs;
  const frame = () => {
    confetti({
      particleCount: 4,
      angle: 60,
      spread: 70,
      origin: { x: 0, y: 0.1 },
      colors: ORANGE_PALETTE,
      gravity: 1.1,
      scalar: 0.9,
      ticks: 200,
    });
    confetti({
      particleCount: 4,
      angle: 120,
      spread: 70,
      origin: { x: 1, y: 0.1 },
      colors: ORANGE_PALETTE,
      gravity: 1.1,
      scalar: 0.9,
      ticks: 200,
    });
    if (Date.now() < end) {
      requestAnimationFrame(frame);
    }
  };
  frame();
}

/** Dispara um toast Sonner customizado + confetti pra eventos celebratórios. */
export function celebrate({ title, body, durationMs }: CelebrationOptions) {
  fireConfetti(durationMs);
  toast.custom(
    (t) => (
      <div className="rounded-xl shadow-xl border border-orange-200 bg-gradient-to-br from-orange-50 via-amber-50 to-orange-100 p-4 min-w-[320px] max-w-[400px] flex items-start gap-3 animate-in slide-in-from-top-4 fade-in">
        <div className="text-2xl shrink-0 leading-none">🎉</div>
        <div className="flex-1 min-w-0">
          <p className="font-bold text-orange-900 text-sm">{title}</p>
          {body && <p className="text-orange-800/90 text-xs mt-0.5">{body}</p>}
        </div>
        <button
          type="button"
          onClick={() => toast.dismiss(t)}
          className="text-orange-700/70 hover:text-orange-900 text-xs"
          aria-label="Fechar"
        >
          ✕
        </button>
      </div>
    ),
    { duration: 8000 },
  );
}
