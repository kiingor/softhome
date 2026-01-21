import { useState, useRef, useEffect } from "react";
import { MasterLayout } from "@/components/master/MasterLayout";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { useSystemTheme, PRESET_COLORS, hexToHSL } from "@/hooks/useSystemTheme";
import { Check, Settings, Loader2, Upload, X, ImageIcon, CreditCard, Eye, EyeOff } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Switch } from "@/components/ui/switch";

export default function MasterConfiguracoesPage() {
  const { toast } = useToast();
  const { settings, isLoading, updatePrimaryColor, previewColor, resetToSaved } = useSystemTheme();
  const [selectedColor, setSelectedColor] = useState<string | null>(null);
  const [customHex, setCustomHex] = useState("");
  const [isSaving, setIsSaving] = useState(false);

  // Hero image state
  const [heroImageUrl, setHeroImageUrl] = useState<string>("");
  const [isUploadingImage, setIsUploadingImage] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Asaas configuration state
  const [asaasEnvironment, setAsaasEnvironment] = useState<'sandbox' | 'production'>('sandbox');
  const [asaasSandboxKey, setAsaasSandboxKey] = useState("");
  const [asaasProductionKey, setAsaasProductionKey] = useState("");
  const [showSandboxKey, setShowSandboxKey] = useState(false);
  const [showProductionKey, setShowProductionKey] = useState(false);
  const [isSavingAsaas, setIsSavingAsaas] = useState(false);
  const [isLoadingAsaas, setIsLoadingAsaas] = useState(true);

  // Load hero image URL and Asaas settings
  useEffect(() => {
    async function loadSettings() {
      // Load hero image
      const { data: heroData } = await supabase
        .from('system_settings')
        .select('setting_value')
        .eq('setting_key', 'hero_image_url')
        .single();
      
      if (heroData?.setting_value) {
        setHeroImageUrl(heroData.setting_value);
      }

      // Load Asaas settings
      const { data: asaasData } = await supabase
        .from('system_settings')
        .select('setting_key, setting_value')
        .in('setting_key', ['asaas_environment', 'asaas_sandbox_key', 'asaas_production_key']);
      
      if (asaasData && asaasData.length > 0) {
        for (const setting of asaasData) {
          if (setting.setting_key === 'asaas_environment') {
            setAsaasEnvironment(setting.setting_value as 'sandbox' | 'production');
          } else if (setting.setting_key === 'asaas_sandbox_key') {
            setAsaasSandboxKey(setting.setting_value);
          } else if (setting.setting_key === 'asaas_production_key') {
            setAsaasProductionKey(setting.setting_value);
          }
        }
      }
      setIsLoadingAsaas(false);
    }
    loadSettings();
  }, []);

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

  async function handleImageUpload(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;

    // Validate file type
    if (!file.type.startsWith('image/')) {
      toast({
        title: "Arquivo inválido",
        description: "Por favor, selecione uma imagem (PNG, JPG ou WebP).",
        variant: "destructive",
      });
      return;
    }

    // Validate file size (max 2MB)
    if (file.size > 2 * 1024 * 1024) {
      toast({
        title: "Arquivo muito grande",
        description: "A imagem deve ter no máximo 2MB.",
        variant: "destructive",
      });
      return;
    }

    setIsUploadingImage(true);
    try {
      const fileExt = file.name.split('.').pop();
      const fileName = `hero-image-${Date.now()}.${fileExt}`;

      // Upload to storage
      const { error: uploadError } = await supabase.storage
        .from('landing-assets')
        .upload(fileName, file, { upsert: true });

      if (uploadError) throw uploadError;

      // Get public URL
      const { data: { publicUrl } } = supabase.storage
        .from('landing-assets')
        .getPublicUrl(fileName);

      // Save URL to settings
      const { error: settingsError } = await supabase
        .from('system_settings')
        .update({ setting_value: publicUrl })
        .eq('setting_key', 'hero_image_url');

      if (settingsError) throw settingsError;

      setHeroImageUrl(publicUrl);
      toast({
        title: "Imagem atualizada",
        description: "A imagem do Hero foi atualizada com sucesso.",
      });
    } catch (error) {
      console.error('Erro ao fazer upload:', error);
      toast({
        title: "Erro ao fazer upload",
        description: "Não foi possível fazer upload da imagem.",
        variant: "destructive",
      });
    } finally {
      setIsUploadingImage(false);
      if (fileInputRef.current) {
        fileInputRef.current.value = "";
      }
    }
  }

  async function handleRemoveImage() {
    setIsUploadingImage(true);
    try {
      // Clear the setting
      const { error } = await supabase
        .from('system_settings')
        .update({ setting_value: '' })
        .eq('setting_key', 'hero_image_url');

      if (error) throw error;

      setHeroImageUrl("");
      toast({
        title: "Imagem removida",
        description: "A imagem personalizada foi removida. A imagem padrão será exibida.",
      });
    } catch (error) {
      toast({
        title: "Erro ao remover",
        description: "Não foi possível remover a imagem.",
        variant: "destructive",
      });
    } finally {
      setIsUploadingImage(false);
    }
  }

  async function upsertSetting(key: string, value: string) {
    const { data: existing, error: existingError } = await supabase
      .from('system_settings')
      .select('id')
      .eq('setting_key', key)
      .maybeSingle();

    if (existingError) throw existingError;

    if (existing) {
      const { error: updateError } = await supabase
        .from('system_settings')
        .update({ setting_value: value })
        .eq('setting_key', key);

      if (updateError) throw updateError;
    } else {
      const { error: insertError } = await supabase
        .from('system_settings')
        .insert({ setting_key: key, setting_value: value });

      if (insertError) throw insertError;
    }
  }

  async function handleSaveAsaas() {
    setIsSavingAsaas(true);
    try {
      const trimmedEnvironment = (asaasEnvironment || 'sandbox').trim() as 'sandbox' | 'production';
      const trimmedSandboxKey = (asaasSandboxKey || '').trim();
      const trimmedProductionKey = (asaasProductionKey || '').trim();

      await Promise.all([
        upsertSetting('asaas_environment', trimmedEnvironment),
        upsertSetting('asaas_sandbox_key', trimmedSandboxKey),
        upsertSetting('asaas_production_key', trimmedProductionKey),
      ]);

      // Keep local state trimmed so UI reflects what's stored
      setAsaasEnvironment(trimmedEnvironment);
      setAsaasSandboxKey(trimmedSandboxKey);
      setAsaasProductionKey(trimmedProductionKey);

      toast({
        title: "Configurações do Asaas salvas",
        description: `Ambiente atual: ${trimmedEnvironment === 'sandbox' ? 'Sandbox (Testes)' : 'Produção'}`,
      });
    } catch (error) {
      console.error('Erro ao salvar configurações do Asaas:', error);
      toast({
        title: "Erro ao salvar",
        description: "Não foi possível salvar as configurações do Asaas.",
        variant: "destructive",
      });
    } finally {
      setIsSavingAsaas(false);
    }
  }

  if (isLoading || isLoadingAsaas) {
    return (
      <MasterLayout>
        <div className="flex items-center justify-center h-64">
          <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
        </div>
      </MasterLayout>
    );
  }

  const currentColor = selectedColor || settings.primary_color;

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

        {/* Card de Configurações do Asaas */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <CreditCard className="w-5 h-5" />
              Integração Asaas (Pagamentos)
            </CardTitle>
            <CardDescription>
              Configure as chaves de API do Asaas para processamento de pagamentos. Alterne entre ambiente de testes (sandbox) e produção.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            {/* Environment Toggle */}
            <div className="flex items-center justify-between p-4 border rounded-lg bg-muted/30">
              <div className="space-y-0.5">
                <Label className="text-base font-medium">Ambiente Atual</Label>
                <p className="text-sm text-muted-foreground">
                  {asaasEnvironment === 'sandbox' 
                    ? 'Sandbox - Ambiente de testes (não processa pagamentos reais)' 
                    : 'Produção - Ambiente real (processa pagamentos de verdade)'}
                </p>
              </div>
              <div className="flex items-center gap-3">
                <span className={`text-sm font-medium ${asaasEnvironment === 'sandbox' ? 'text-primary' : 'text-muted-foreground'}`}>
                  Sandbox
                </span>
                <Switch
                  checked={asaasEnvironment === 'production'}
                  onCheckedChange={(checked) => setAsaasEnvironment(checked ? 'production' : 'sandbox')}
                />
                <span className={`text-sm font-medium ${asaasEnvironment === 'production' ? 'text-primary' : 'text-muted-foreground'}`}>
                  Produção
                </span>
              </div>
            </div>

            {/* Sandbox Key */}
            <div className="space-y-2">
              <Label htmlFor="sandbox-key" className="flex items-center gap-2">
                Chave API Sandbox
                {asaasEnvironment === 'sandbox' && (
                  <span className="text-xs bg-primary/10 text-primary px-2 py-0.5 rounded-full">Em uso</span>
                )}
              </Label>
              <div className="flex gap-2">
                <div className="relative flex-1">
                  <Input
                    id="sandbox-key"
                    type={showSandboxKey ? "text" : "password"}
                    value={asaasSandboxKey}
                    onChange={(e) => setAsaasSandboxKey(e.target.value)}
                    placeholder="$aact_YTU5YTE0M2M2..."
                    className="pr-10"
                  />
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="absolute right-1 top-1/2 -translate-y-1/2 h-7 w-7 p-0"
                    onClick={() => setShowSandboxKey(!showSandboxKey)}
                  >
                    {showSandboxKey ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </Button>
                </div>
              </div>
              <p className="text-xs text-muted-foreground">
                Chave de testes do Asaas (inicia com $aact_)
              </p>
            </div>

            {/* Production Key */}
            <div className="space-y-2">
              <Label htmlFor="production-key" className="flex items-center gap-2">
                Chave API Produção
                {asaasEnvironment === 'production' && (
                  <span className="text-xs bg-destructive/10 text-destructive px-2 py-0.5 rounded-full">Em uso</span>
                )}
              </Label>
              <div className="flex gap-2">
                <div className="relative flex-1">
                  <Input
                    id="production-key"
                    type={showProductionKey ? "text" : "password"}
                    value={asaasProductionKey}
                    onChange={(e) => setAsaasProductionKey(e.target.value)}
                    placeholder="$aact_YTU5YTE0M2M2..."
                    className="pr-10"
                  />
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="absolute right-1 top-1/2 -translate-y-1/2 h-7 w-7 p-0"
                    onClick={() => setShowProductionKey(!showProductionKey)}
                  >
                    {showProductionKey ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </Button>
                </div>
              </div>
              <p className="text-xs text-muted-foreground">
                Chave de produção do Asaas (inicia com $aact_)
              </p>
            </div>

            {/* Save Button */}
            <Button onClick={handleSaveAsaas} disabled={isSavingAsaas}>
              {isSavingAsaas && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
              Salvar Configurações do Asaas
            </Button>
          </CardContent>
        </Card>

        {/* Card de Tema */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <div 
                className="w-5 h-5 rounded-full border-2 border-white shadow-sm"
                style={{ backgroundColor: `hsl(${currentColor})` }}
              />
              Tema e Cores
            </CardTitle>
            <CardDescription>
              Defina a cor primária do sistema. Afeta Landing Page, Dashboard e Portal Master.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            {/* Cores predefinidas com nomes */}
            <div className="space-y-3">
              <Label>Cor Primária</Label>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                {PRESET_COLORS.map((color) => {
                  const isSelected = currentColor === color.value;
                  
                  return (
                    <button
                      key={color.value}
                      onClick={() => handlePresetClick(color)}
                      className={`flex items-center gap-3 p-3 rounded-lg border-2 transition-all ${
                        isSelected 
                          ? 'border-primary bg-primary/5' 
                          : 'border-border hover:border-primary/50 hover:bg-muted/50'
                      }`}
                    >
                      <div 
                        className="w-8 h-8 rounded-lg shadow-sm flex-shrink-0"
                        style={{ backgroundColor: color.hex }}
                      />
                      <span className="text-sm font-medium text-foreground">{color.name}</span>
                      {isSelected && (
                        <Check className="w-4 h-4 text-primary ml-auto flex-shrink-0" />
                      )}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Cor customizada */}
            <div className="space-y-3">
              <Label>Cor Personalizada</Label>
              <div className="flex items-center gap-3">
                <div className="relative">
                  <Input
                    type="text"
                    placeholder="#000000"
                    value={customHex}
                    onChange={(e) => handleCustomHexChange(e.target.value)}
                    className="w-32 pl-10 font-mono"
                    maxLength={7}
                  />
                  <div 
                    className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 rounded border"
                    style={{ 
                      backgroundColor: /^#[0-9A-Fa-f]{6}$/.test(customHex) 
                        ? customHex 
                        : '#e5e5e5' 
                    }}
                  />
                </div>
                <Input
                  type="color"
                  value={customHex || "#f97316"}
                  onChange={(e) => handleCustomHexChange(e.target.value)}
                  className="w-12 h-10 p-1 cursor-pointer"
                />
              </div>
            </div>

            {/* Ações */}
            {selectedColor && (
              <div className="flex gap-3 pt-2">
                <Button onClick={handleSave} disabled={isSaving}>
                  {isSaving && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
                  Salvar Cor
                </Button>
                <Button variant="outline" onClick={handleCancel} disabled={isSaving}>
                  Cancelar
                </Button>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Card de Imagem da Landing Page */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <ImageIcon className="w-5 h-5" />
              Imagem da Landing Page
            </CardTitle>
            <CardDescription>
              Imagem exibida na seção Hero da Landing Page
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {/* Current Image Preview */}
            <div className="space-y-3">
              <Label>Imagem Atual</Label>
              <div className="border rounded-lg p-4 bg-muted/30">
                {heroImageUrl ? (
                  <div className="relative group inline-block">
                    <img 
                      src={heroImageUrl} 
                      alt="Hero da Landing Page"
                      className="max-w-md h-48 object-cover rounded-lg shadow-sm"
                    />
                    <Button
                      variant="destructive"
                      size="sm"
                      className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity"
                      onClick={handleRemoveImage}
                      disabled={isUploadingImage}
                    >
                      <X className="w-4 h-4" />
                    </Button>
                  </div>
                ) : (
                  <div className="max-w-md h-48 rounded-lg bg-muted flex items-center justify-center">
                    <div className="text-center text-muted-foreground">
                      <ImageIcon className="w-12 h-12 mx-auto mb-2 opacity-50" />
                      <p className="text-sm">Usando imagem padrão</p>
                    </div>
                  </div>
                )}
              </div>
            </div>

            {/* Upload Button */}
            <div className="space-y-2">
              <input
                ref={fileInputRef}
                type="file"
                accept="image/png,image/jpeg,image/webp"
                onChange={handleImageUpload}
                className="hidden"
              />
              <Button 
                variant="outline" 
                onClick={() => fileInputRef.current?.click()}
                disabled={isUploadingImage}
              >
                {isUploadingImage ? (
                  <>
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                    Enviando...
                  </>
                ) : (
                  <>
                    <Upload className="w-4 h-4 mr-2" />
                    Fazer Upload de Nova Imagem
                  </>
                )}
              </Button>
              <p className="text-xs text-muted-foreground">
                Formatos aceitos: PNG, JPG, WebP (máximo 2MB)
              </p>
            </div>
          </CardContent>
        </Card>
      </div>
    </MasterLayout>
  );
}
