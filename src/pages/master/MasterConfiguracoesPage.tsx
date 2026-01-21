import { useState } from "react";
import { MasterLayout } from "@/components/master/MasterLayout";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { useSystemTheme, PRESET_COLORS, hexToHSL } from "@/hooks/useSystemTheme";
import { Palette, Check, Settings, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";

export default function MasterConfiguracoesPage() {
  const { toast } = useToast();
  const { settings, isLoading, updatePrimaryColor, previewColor, resetToSaved } = useSystemTheme();
  const [selectedColor, setSelectedColor] = useState<string | null>(null);
  const [customHex, setCustomHex] = useState("");
  const [isSaving, setIsSaving] = useState(false);

  // Encontrar cor atual nas predefinidas
  const currentPreset = PRESET_COLORS.find(c => c.value === settings.primary_color);

  function handlePresetClick(color: typeof PRESET_COLORS[0]) {
    setSelectedColor(color.value);
    setCustomHex("");
    previewColor(color.value);
  }

  function handleCustomHexChange(hex: string) {
    setCustomHex(hex);
    if (/^#[0-9A-Fa-f]{6}$/.test(hex)) {
      const hsl = hexToHSL(hex);
      setSelectedColor(hsl);
      previewColor(hsl);
    }
  }

  function handleCancel() {
    setSelectedColor(null);
    setCustomHex("");
    resetToSaved();
  }

  async function handleSave() {
    if (!selectedColor) return;
    
    setIsSaving(true);
    const success = await updatePrimaryColor(selectedColor);
    setIsSaving(false);

    if (success) {
      toast({
        title: "Configurações salvas",
        description: "A cor primária do sistema foi atualizada com sucesso.",
      });
      setSelectedColor(null);
      setCustomHex("");
    } else {
      toast({
        title: "Erro ao salvar",
        description: "Não foi possível atualizar as configurações. Tente novamente.",
        variant: "destructive",
      });
    }
  }

  if (isLoading) {
    return (
      <MasterLayout>
        <div className="flex items-center justify-center h-64">
          <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
        </div>
      </MasterLayout>
    );
  }

  return (
    <MasterLayout>
      <div className="space-y-6">
        {/* Header */}
        <div>
          <h1 className="text-2xl font-bold text-foreground flex items-center gap-3">
            <Settings className="w-7 h-7" />
            Configurações do Sistema
          </h1>
          <p className="text-muted-foreground mt-1">
            Gerencie as configurações globais do sistema
          </p>
        </div>

        {/* Card de Tema */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Palette className="w-5 h-5" />
              Tema e Cores
            </CardTitle>
            <CardDescription>
              Configure a cor primária do sistema. Esta cor será aplicada em todo o sistema: 
              Landing Page, Dashboard das empresas e Portal Master.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            {/* Cor atual */}
            <div className="flex items-center gap-3 p-4 bg-muted/50 rounded-lg">
              <div 
                className="w-10 h-10 rounded-lg shadow-sm border"
                style={{ backgroundColor: `hsl(${settings.primary_color})` }}
              />
              <div>
                <p className="text-sm font-medium">Cor atual</p>
                <p className="text-xs text-muted-foreground">
                  {currentPreset?.name || "Cor personalizada"}
                </p>
              </div>
            </div>

            {/* Cores predefinidas */}
            <div className="space-y-3">
              <Label>Cores predefinidas</Label>
              <div className="grid grid-cols-4 sm:grid-cols-8 gap-3">
                {PRESET_COLORS.map((color) => {
                  const isSelected = selectedColor === color.value;
                  const isCurrent = settings.primary_color === color.value && !selectedColor;
                  
                  return (
                    <button
                      key={color.value}
                      onClick={() => handlePresetClick(color)}
                      className={cn(
                        "relative w-12 h-12 rounded-xl transition-all duration-200",
                        "hover:scale-110 hover:shadow-lg",
                        "focus:outline-none focus:ring-2 focus:ring-offset-2",
                        (isSelected || isCurrent) && "ring-2 ring-offset-2 ring-foreground"
                      )}
                      style={{ backgroundColor: color.hex }}
                      title={color.name}
                    >
                      {(isSelected || isCurrent) && (
                        <Check className="absolute inset-0 m-auto w-5 h-5 text-white drop-shadow-md" />
                      )}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Cor customizada */}
            <div className="space-y-3">
              <Label htmlFor="custom-color">Cor personalizada (HEX)</Label>
              <div className="flex gap-3 items-center">
                <Input
                  id="custom-color"
                  type="text"
                  placeholder="#f97316"
                  value={customHex}
                  onChange={(e) => handleCustomHexChange(e.target.value)}
                  className="max-w-[150px] font-mono"
                />
                <Input
                  type="color"
                  value={customHex || "#f97316"}
                  onChange={(e) => handleCustomHexChange(e.target.value)}
                  className="w-12 h-10 p-1 cursor-pointer"
                />
                {customHex && /^#[0-9A-Fa-f]{6}$/.test(customHex) && (
                  <div 
                    className="w-10 h-10 rounded-lg border shadow-sm"
                    style={{ backgroundColor: customHex }}
                  />
                )}
              </div>
            </div>

            {/* Preview */}
            {selectedColor && (
              <div className="space-y-3 p-4 bg-muted/30 rounded-lg border">
                <Label>Preview</Label>
                <div className="flex flex-wrap gap-3">
                  <Button size="sm">Botão Primário</Button>
                  <Button size="sm" variant="outline">Botão Outline</Button>
                  <div className="px-3 py-1 rounded-full bg-primary text-primary-foreground text-sm font-medium">
                    Badge
                  </div>
                  <div 
                    className="px-4 py-2 rounded-lg text-white text-sm font-medium"
                    style={{ 
                      background: `linear-gradient(135deg, hsl(${selectedColor}), hsl(${selectedColor} / 0.8))`
                    }}
                  >
                    Gradiente
                  </div>
                </div>
              </div>
            )}

            {/* Ações */}
            {selectedColor && (
              <div className="flex gap-3 pt-4 border-t">
                <Button onClick={handleSave} disabled={isSaving}>
                  {isSaving && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
                  Salvar Alterações
                </Button>
                <Button variant="outline" onClick={handleCancel} disabled={isSaving}>
                  Cancelar
                </Button>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </MasterLayout>
  );
}
