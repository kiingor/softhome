import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

const DEFAULT_PRIMARY_COLOR = "24 95% 53%";

function applyPrimaryColor(hslValue: string) {
  const root = document.documentElement;
  root.style.setProperty('--primary', hslValue);
  root.style.setProperty('--ring', hslValue);
  root.style.setProperty('--sidebar-primary', hslValue);
  root.style.setProperty('--sidebar-ring', hslValue);
  root.style.setProperty('--gradient-hero', `linear-gradient(135deg, hsl(${hslValue}), hsl(${hslValue} / 0.8))`);
  root.style.setProperty('--shadow-glow', `0 10px 40px -10px hsl(${hslValue} / 0.4)`);
}

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    async function loadTheme() {
      try {
        const { data } = await supabase
          .from('system_settings')
          .select('setting_value')
          .eq('setting_key', 'primary_color')
          .single();

        if (data?.setting_value) {
          applyPrimaryColor(data.setting_value);
        }
      } catch (error) {
        console.error('Erro ao carregar tema:', error);
      } finally {
        setLoaded(true);
      }
    }

    loadTheme();
  }, []);

  // Renderiza imediatamente, o tema será aplicado assim que carregar
  return <>{children}</>;
}
