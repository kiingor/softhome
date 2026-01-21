import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

interface SystemSettings {
  primary_color: string;
}

const DEFAULT_PRIMARY_COLOR = "24 95% 53%"; // Laranja padrão

// Cores pré-definidas para seleção
export const PRESET_COLORS = [
  { name: "Laranja", value: "24 95% 53%", hex: "#f97316" },
  { name: "Azul", value: "217 91% 60%", hex: "#3b82f6" },
  { name: "Verde", value: "142 71% 45%", hex: "#22c55e" },
  { name: "Roxo", value: "258 90% 66%", hex: "#8b5cf6" },
  { name: "Vermelho", value: "0 84% 60%", hex: "#ef4444" },
  { name: "Rosa", value: "330 81% 60%", hex: "#ec4899" },
  { name: "Teal", value: "168 76% 42%", hex: "#14b8a6" },
  { name: "Índigo", value: "239 84% 67%", hex: "#6366f1" },
];

// Função para converter hex para HSL
export function hexToHSL(hex: string): string {
  // Remove o # se presente
  hex = hex.replace(/^#/, '');

  // Parse RGB
  const r = parseInt(hex.substring(0, 2), 16) / 255;
  const g = parseInt(hex.substring(2, 4), 16) / 255;
  const b = parseInt(hex.substring(4, 6), 16) / 255;

  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  let h = 0;
  let s = 0;
  const l = (max + min) / 2;

  if (max !== min) {
    const d = max - min;
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    
    switch (max) {
      case r:
        h = ((g - b) / d + (g < b ? 6 : 0)) / 6;
        break;
      case g:
        h = ((b - r) / d + 2) / 6;
        break;
      case b:
        h = ((r - g) / d + 4) / 6;
        break;
    }
  }

  return `${Math.round(h * 360)} ${Math.round(s * 100)}% ${Math.round(l * 100)}%`;
}

// Função para aplicar a cor primária no CSS
function applyPrimaryColor(hslValue: string) {
  const root = document.documentElement;
  
  // Aplicar a cor primária principal
  root.style.setProperty('--primary', hslValue);
  root.style.setProperty('--ring', hslValue);
  root.style.setProperty('--sidebar-primary', hslValue);
  root.style.setProperty('--sidebar-ring', hslValue);
  
  // Atualizar gradientes
  root.style.setProperty('--gradient-hero', `linear-gradient(135deg, hsl(${hslValue}), hsl(${hslValue} / 0.8))`);
  root.style.setProperty('--shadow-glow', `0 10px 40px -10px hsl(${hslValue} / 0.4)`);
}

export function useSystemTheme() {
  const [settings, setSettings] = useState<SystemSettings>({
    primary_color: DEFAULT_PRIMARY_COLOR,
  });
  const [isLoading, setIsLoading] = useState(true);

  // Carregar configurações do banco
  async function loadSettings() {
    try {
      const { data, error } = await supabase
        .from('system_settings')
        .select('setting_key, setting_value');

      if (error) throw error;

      if (data) {
        const newSettings: SystemSettings = { primary_color: DEFAULT_PRIMARY_COLOR };
        
        data.forEach((item) => {
          if (item.setting_key === 'primary_color') {
            newSettings.primary_color = item.setting_value;
          }
        });

        setSettings(newSettings);
        applyPrimaryColor(newSettings.primary_color);
      }
    } catch (error) {
      console.error('Erro ao carregar configurações do tema:', error);
      applyPrimaryColor(DEFAULT_PRIMARY_COLOR);
    } finally {
      setIsLoading(false);
    }
  }

  // Atualizar cor primária no banco
  async function updatePrimaryColor(hslValue: string) {
    try {
      const { error } = await supabase
        .from('system_settings')
        .update({ 
          setting_value: hslValue,
          updated_at: new Date().toISOString()
        })
        .eq('setting_key', 'primary_color');

      if (error) throw error;

      setSettings(prev => ({ ...prev, primary_color: hslValue }));
      applyPrimaryColor(hslValue);
      return true;
    } catch (error) {
      console.error('Erro ao atualizar cor primária:', error);
      return false;
    }
  }

  // Aplicar cor em tempo real (preview)
  function previewColor(hslValue: string) {
    applyPrimaryColor(hslValue);
  }

  // Resetar para a cor salva (cancelar preview)
  function resetToSaved() {
    applyPrimaryColor(settings.primary_color);
  }

  useEffect(() => {
    loadSettings();
  }, []);

  return {
    settings,
    isLoading,
    updatePrimaryColor,
    previewColor,
    resetToSaved,
    refetch: loadSettings,
  };
}
