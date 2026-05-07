import { useEffect, useMemo, useState } from "react";
import { useParams, Link } from "react-router-dom";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { toast } from "sonner";
import {
  CircleNotch as Loader2,
  CheckCircle,
  Warning,
  FileText,
  Trophy,
  FileArrowDown as Upload,
} from "@phosphor-icons/react";
import {
  getAdmissionByToken,
  submitAdmissionDocs,
  type GetByTokenResult,
  type PublicDocumentInfo,
} from "../services/public-admission.service";
import {
  REGIME_LABELS,
  DOCUMENT_STATUS_LABELS,
  getDocumentDisplayLabel,
  isTextResponseDoc,
} from "../types";
import { Textarea } from "@/components/ui/textarea";
import { formatCPFInput, formatPhoneInput, formatCEPInput, cleanCEP, BRAZIL_STATES } from "@/lib/validators";
import { SoftHouseLogo } from "@/components/branding/SoftHouseLogo";
import { TestStageView } from "../components/TestStageView";

type PageState =
  | { kind: "loading" }
  | { kind: "error"; message: string; expired?: boolean; finalStatus?: string }
  | { kind: "ready"; data: GetByTokenResult }
  | { kind: "submitted"; data: GetByTokenResult; allReady: boolean };

export default function AdmissaoPublicaPage() {
  const { token } = useParams<{ token: string }>();
  const [state, setState] = useState<PageState>({ kind: "loading" });
  const [textAnswers, setTextAnswers] = useState<Record<string, string>>({});
  const [savingDocs, setSavingDocs] = useState<Set<string>>(new Set());
  const [savingForm, setSavingForm] = useState(false);

  // Form de dados pessoais — pre-fills do journey, edita inline, auto-save
  // ao sair do campo.
  const [form, setForm] = useState({
    email: "",
    phone: "",
    cpf: "",
    birth_date: "",
    rg: "",
    zip: "",
    address: "",
    address_number: "",
    address_complement: "",
    neighborhood: "",
    city: "",
    state: "",
  });

  // Pre-fill quando journey carrega (ou recarrega depois de save)
  useEffect(() => {
    if (state.kind !== "ready" && state.kind !== "submitted") return;
    const j = state.data.journey;
    setForm({
      email: j.candidate_email ?? "",
      phone: j.candidate_phone ? formatPhoneInput(j.candidate_phone) : "",
      cpf: j.candidate_cpf ? formatCPFInput(j.candidate_cpf) : "",
      birth_date: j.candidate_birth_date ?? "",
      rg: j.candidate_rg ?? "",
      zip: j.candidate_zip ? formatCEPInput(j.candidate_zip) : "",
      address: j.candidate_address ?? "",
      address_number: j.candidate_address_number ?? "",
      address_complement: j.candidate_address_complement ?? "",
      neighborhood: j.candidate_neighborhood ?? "",
      city: j.candidate_city ?? "",
      state: j.candidate_state ?? "",
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.kind === "ready" || state.kind === "submitted" ? state.data.journey.id : null]);

  useEffect(() => {
    if (!token) return;
    (async () => {
      try {
        const result = await getAdmissionByToken(token);
        setState({ kind: "ready", data: result });
      } catch (err) {
        const msg = (err as Error).message;
        const expired = msg.includes("expired");
        const finalStatusMatch = msg.match(/status:(\w+)/);
        setState({
          kind: "error",
          message: msg,
          expired,
          finalStatus: finalStatusMatch?.[1],
        });
      }
    })();
  }, [token]);

  // Documentos que ainda precisam de submissão (pending OU needs_adjustment)
  const docsToSubmit = useMemo(() => {
    if (state.kind !== "ready" && state.kind !== "submitted") return [];
    return state.data.documents.filter(
      (d) => d.status === "pending" || d.status === "needs_adjustment",
    );
  }, [state]);

  // Marca/desmarca um docId como "salvando"
  const setSavingFor = (docId: string, on: boolean) => {
    setSavingDocs((prev) => {
      const next = new Set(prev);
      if (on) next.add(docId);
      else next.delete(docId);
      return next;
    });
  };

  // Submete UM doc (file OU text) imediatamente. Refaz o fetch pra atualizar
  // status no DB e contabilizar na barra de progresso.
  const submitOne = async (
    docId: string,
    payload: { file?: File; text?: string },
  ) => {
    if (!token) return;
    if (state.kind !== "ready" && state.kind !== "submitted") return;
    setSavingFor(docId, true);
    try {
      const result = await submitAdmissionDocs({
        token,
        documents: payload.file ? [{ doc_id: docId, file: payload.file }] : [],
        text_responses: payload.text
          ? [{ doc_id: docId, text: payload.text }]
          : [],
      });

      const refreshed = await getAdmissionByToken(token);
      setState({
        kind: "submitted",
        data: refreshed,
        allReady: result.allRequiredReady,
      });

      if (result.errors.length > 0) {
        toast.error(result.errors[0].error);
      } else {
        toast.success("Salvo ✓", { duration: 1500 });
      }
    } catch (err) {
      toast.error("Não rolou. " + (err as Error).message);
    } finally {
      setSavingFor(docId, false);
    }
  };

  const handleFile = async (
    docId: string,
    e: React.ChangeEvent<HTMLInputElement>,
  ) => {
    const file = e.target.files?.[0];
    e.target.value = ""; // permite escolher mesmo arquivo de novo se quiser
    if (!file) return;
    if (file.size > 10 * 1024 * 1024) {
      toast.error("Arquivo passou de 10MB. Reduz e tenta de novo?");
      return;
    }
    await submitOne(docId, { file });
  };

  // Salva os dados pessoais (chamado em onBlur de cada campo, com merge do
  // form atual + override pra evitar race se vier um update programático).
  const saveForm = async (override?: Partial<typeof form>) => {
    if (!token) return;
    if (state.kind !== "ready" && state.kind !== "submitted") return;
    const data = { ...form, ...(override ?? {}) };
    setSavingForm(true);
    try {
      const result = await submitAdmissionDocs({
        token,
        candidate_data: {
          phone: data.phone.replace(/\D/g, "") || undefined,
          cpf: data.cpf.replace(/\D/g, "") || undefined,
          email: data.email,
          birth_date: data.birth_date || undefined,
          rg: data.rg,
          zip: cleanCEP(data.zip),
          address: data.address,
          address_number: data.address_number,
          address_complement: data.address_complement,
          neighborhood: data.neighborhood,
          city: data.city,
          state: data.state,
        },
        documents: [],
        text_responses: [],
      });
      const refreshed = await getAdmissionByToken(token);
      setState({
        kind: "submitted",
        data: refreshed,
        allReady: result.allRequiredReady,
      });
    } catch (err) {
      toast.error("Não rolou salvar dados. " + (err as Error).message);
    } finally {
      setSavingForm(false);
    }
  };

  // Busca CEP via ViaCEP. Auto-preenche endereço, bairro, cidade, UF.
  const handleCepBlur = async () => {
    const clean = cleanCEP(form.zip);
    if (clean.length !== 8) {
      // CEP incompleto, salva mesmo assim pra persistir o digitado
      if (form.zip !== "") await saveForm();
      return;
    }
    try {
      const r = await fetch(`https://viacep.com.br/ws/${clean}/json/`);
      const d = await r.json();
      if (d.erro) {
        toast.error("CEP não encontrado.");
        await saveForm();
        return;
      }
      const updates = {
        zip: clean,
        address: d.logradouro || form.address,
        neighborhood: d.bairro || form.neighborhood,
        city: d.localidade || form.city,
        state: d.uf || form.state,
      };
      setForm((prev) => ({ ...prev, ...updates }));
      await saveForm(updates);
    } catch {
      // Falha de rede — só salva o que tiver e segue
      await saveForm();
    }
  };

  const handleTextSave = async (docId: string, text: string) => {
    if (!text.trim()) return;
    await submitOne(docId, { text });
  };

  // ─────────────────────────────────────────────────────────────────────────
  // Loading
  // ─────────────────────────────────────────────────────────────────────────
  if (state.kind === "loading") {
    return (
      <div className="min-h-screen gradient-warm flex items-center justify-center p-6">
        <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Erro / expirado / encerrado
  // ─────────────────────────────────────────────────────────────────────────
  if (state.kind === "error") {
    const isFinal = state.finalStatus === "admitted";
    return (
      <div className="min-h-screen gradient-warm flex items-center justify-center p-6">
        <Card className="w-full max-w-md">
          <CardContent className="p-8 text-center">
            <div
              className={`w-16 h-16 rounded-2xl flex items-center justify-center mx-auto mb-4 ${
                isFinal
                  ? "bg-orange-100 dark:bg-orange-900/30"
                  : "bg-muted"
              }`}
            >
              {isFinal ? (
                <Trophy className="w-8 h-8 text-orange-700 dark:text-orange-300" />
              ) : (
                <Warning className="w-8 h-8 text-muted-foreground" />
              )}
            </div>
            <h1 className="text-xl font-bold text-foreground mb-2">
              {isFinal
                ? "Admissão concluída ✓"
                : state.expired
                ? "Link expirou"
                : "Link inválido"}
            </h1>
            <p className="text-muted-foreground mb-6">
              {isFinal
                ? "Que bom te ver aqui — você já foi admitido. Bora começar?"
                : state.expired
                ? "Pede pra empresa gerar um novo link de acesso."
                : "Verifica se você copiou o link completo. Se persistir, pede um novo pra empresa."}
            </p>
            <Button asChild variant="outline">
              <Link to="/">Voltar</Link>
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Ready / submitted (mesma UI, com adições de status)
  // ─────────────────────────────────────────────────────────────────────────
  const { journey, documents } = state.data;

  // Progresso global (formulário + documentos). Fica numa barra sticky
  // no topo pra ficar sempre visível enquanto o candidato rola a página.
  const requiredFormFields: Array<keyof typeof form> = [
    "email",
    "phone",
    "cpf",
    "rg",
    "birth_date",
    "zip",
    "address",
    "address_number",
    "neighborhood",
    "city",
    "state",
  ];
  const filledFields = requiredFormFields.filter(
    (f) => String(form[f] ?? "").trim().length > 0,
  ).length;
  const totalFields = requiredFormFields.length;
  const totalDocs = documents.length;
  const doneDocs = documents.filter(
    (d) =>
      d.status === "approved" ||
      d.status === "submitted" ||
      d.status === "ai_validating",
  ).length;
  const totalSteps = totalFields + totalDocs;
  const doneSteps = filledFields + doneDocs;
  const progressPct =
    totalSteps === 0 ? 0 : Math.round((doneSteps / totalSteps) * 100);

  // Etapa 1: testes — quando journey ainda está em tests_pending/in_review
  // mostra o fluxo de testes em vez do form de docs.
  if (journey.status === "tests_pending" || journey.status === "tests_in_review") {
    return (
      <div className="min-h-screen gradient-warm py-8 px-4">
        <div className="max-w-2xl mx-auto">
          <div className="text-center mb-8">
            <div className="inline-flex items-center gap-2 mb-2">
              <SoftHouseLogo size="md" />
              <span className="text-lg font-extrabold tracking-tight text-foreground">
                SoftHouse
              </span>
            </div>
          </div>
          <TestStageView
            token={token!}
            onAdvancedToStage2={() => window.location.reload()}
          />
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen gradient-warm pb-8">
      {/* Header sticky com logo + progresso global */}
      <div className="sticky top-0 z-30 bg-background/85 backdrop-blur-md border-b border-border/60">
        <div className="max-w-2xl mx-auto px-4 py-3 space-y-2">
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <SoftHouseLogo size="sm" />
              <span className="text-sm sm:text-base font-extrabold tracking-tight text-foreground">
                SoftHouse
              </span>
            </div>
            <div className="text-right">
              <div className="text-[10px] uppercase tracking-wider text-muted-foreground">
                Progresso
              </div>
              <div className="text-sm font-bold text-foreground tabular-nums">
                {progressPct}%
              </div>
            </div>
          </div>
          <Progress value={progressPct} className="h-2" />
          <p className="text-[11px] text-muted-foreground tabular-nums">
            <strong>{filledFields}/{totalFields}</strong> dados ·{" "}
            <strong>{doneDocs}/{totalDocs}</strong> documentos
          </p>
        </div>
      </div>

      <div className="max-w-2xl mx-auto px-4 pt-6">
        {/* Welcome card */}
        <Card className="mb-6">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              Que bom te ver aqui 👋
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            <p className="text-sm text-foreground">
              Olá <strong>{journey.candidate_name}</strong>, você está em
              processo de admissão{" "}
              {journey.company_name && (
                <>
                  na <strong>{journey.company_name}</strong>
                </>
              )}{" "}
              como <strong>{REGIME_LABELS[journey.regime]}</strong>.
            </p>
            <p className="text-sm text-muted-foreground">
              {state.kind === "submitted" && state.allReady
                ? "Já recebemos todos seus documentos. Agora é só esperar o RH revisar — você vai receber um email."
                : "Anexa abaixo os documentos requeridos. Pode vir como PDF ou foto (JPG/PNG)."}
            </p>
          </CardContent>
        </Card>

        {/* Dados pessoais */}
        <Card className="mb-6">
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              Seus dados
              <span className="text-xs font-normal text-muted-foreground tabular-nums">
                {filledFields}/{totalFields}
              </span>
            </CardTitle>
            <p className="text-xs text-muted-foreground">
              Salva automático ao sair do campo. Esses dados viram seu
              cadastro de colaborador depois da admissão.
            </p>
          </CardHeader>
          <CardContent className="space-y-5">
            {/* Pessoais */}
            <div>
              <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground mb-3">
                Pessoais
              </p>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="space-y-1.5 sm:col-span-2">
                  <Label htmlFor="email">Email *</Label>
                  <Input
                    id="email"
                    type="email"
                    value={form.email}
                    onChange={(e) =>
                      setForm((p) => ({ ...p, email: e.target.value }))
                    }
                    onBlur={() => saveForm()}
                    placeholder="seu.email@exemplo.com"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="phone">Telefone *</Label>
                  <Input
                    id="phone"
                    value={form.phone}
                    onChange={(e) =>
                      setForm((p) => ({
                        ...p,
                        phone: formatPhoneInput(e.target.value),
                      }))
                    }
                    onBlur={() => saveForm()}
                    placeholder="(11) 99999-9999"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="cpf">CPF *</Label>
                  <Input
                    id="cpf"
                    value={form.cpf}
                    onChange={(e) =>
                      setForm((p) => ({
                        ...p,
                        cpf: formatCPFInput(e.target.value),
                      }))
                    }
                    onBlur={() => saveForm()}
                    placeholder="000.000.000-00"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="rg">RG *</Label>
                  <Input
                    id="rg"
                    value={form.rg}
                    onChange={(e) =>
                      setForm((p) => ({ ...p, rg: e.target.value }))
                    }
                    onBlur={() => saveForm()}
                    placeholder="00.000.000-0"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="birth_date">Data de nascimento *</Label>
                  <Input
                    id="birth_date"
                    type="date"
                    value={form.birth_date}
                    onChange={(e) =>
                      setForm((p) => ({ ...p, birth_date: e.target.value }))
                    }
                    onBlur={() => saveForm()}
                  />
                </div>
              </div>
            </div>

            {/* Endereço */}
            <div>
              <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground mb-3">
                Endereço
              </p>
              <div className="grid grid-cols-1 sm:grid-cols-6 gap-3">
                <div className="space-y-1.5 sm:col-span-2">
                  <Label htmlFor="zip">CEP *</Label>
                  <Input
                    id="zip"
                    value={form.zip}
                    onChange={(e) =>
                      setForm((p) => ({
                        ...p,
                        zip: formatCEPInput(e.target.value),
                      }))
                    }
                    onBlur={handleCepBlur}
                    placeholder="00000-000"
                  />
                  <p className="text-[11px] text-muted-foreground">
                    Buscamos o endereço pelo CEP automaticamente.
                  </p>
                </div>
                <div className="space-y-1.5 sm:col-span-3">
                  <Label htmlFor="address">Logradouro *</Label>
                  <Input
                    id="address"
                    value={form.address}
                    onChange={(e) =>
                      setForm((p) => ({ ...p, address: e.target.value }))
                    }
                    onBlur={() => saveForm()}
                    placeholder="Rua, Avenida..."
                  />
                </div>
                <div className="space-y-1.5 sm:col-span-1">
                  <Label htmlFor="address_number">Número *</Label>
                  <Input
                    id="address_number"
                    value={form.address_number}
                    onChange={(e) =>
                      setForm((p) => ({
                        ...p,
                        address_number: e.target.value,
                      }))
                    }
                    onBlur={() => saveForm()}
                    placeholder="123"
                  />
                </div>
                <div className="space-y-1.5 sm:col-span-3">
                  <Label htmlFor="address_complement">Complemento</Label>
                  <Input
                    id="address_complement"
                    value={form.address_complement}
                    onChange={(e) =>
                      setForm((p) => ({
                        ...p,
                        address_complement: e.target.value,
                      }))
                    }
                    onBlur={() => saveForm()}
                    placeholder="Apto, bloco..."
                  />
                </div>
                <div className="space-y-1.5 sm:col-span-3">
                  <Label htmlFor="neighborhood">Bairro *</Label>
                  <Input
                    id="neighborhood"
                    value={form.neighborhood}
                    onChange={(e) =>
                      setForm((p) => ({ ...p, neighborhood: e.target.value }))
                    }
                    onBlur={() => saveForm()}
                  />
                </div>
                <div className="space-y-1.5 sm:col-span-4">
                  <Label htmlFor="city">Cidade *</Label>
                  <Input
                    id="city"
                    value={form.city}
                    onChange={(e) =>
                      setForm((p) => ({ ...p, city: e.target.value }))
                    }
                    onBlur={() => saveForm()}
                  />
                </div>
                <div className="space-y-1.5 sm:col-span-2">
                  <Label htmlFor="state">UF *</Label>
                  <select
                    id="state"
                    value={form.state}
                    onChange={(e) => {
                      const v = e.target.value;
                      setForm((p) => ({ ...p, state: v }));
                      saveForm({ state: v });
                    }}
                    className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  >
                    <option value="">--</option>
                    {BRAZIL_STATES.map((uf) => (
                      <option key={uf} value={uf}>
                        {uf}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
            </div>

            {savingForm && (
              <p className="text-xs text-muted-foreground flex items-center gap-1.5">
                <Loader2 className="w-3 h-3 animate-spin" />
                Salvando…
              </p>
            )}
          </CardContent>
        </Card>

        {/* Documentos */}
        <Card className="mb-6">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              Documentos
              <span className="text-xs font-normal text-muted-foreground tabular-nums">
                {doneDocs}/{totalDocs}
              </span>
            </CardTitle>
            <p className="text-sm text-muted-foreground">
              {docsToSubmit.length === 0
                ? "Tudo enviado — só esperar a revisão do RH."
                : `Falta${docsToSubmit.length === 1 ? "" : "m"} ${docsToSubmit.length} documento${docsToSubmit.length === 1 ? "" : "s"}.`}
            </p>
          </CardHeader>
          <CardContent>
            <ul className="divide-y divide-border">
              {documents.map((doc) => (
                <DocRow
                  key={doc.id}
                  doc={doc}
                  saving={savingDocs.has(doc.id)}
                  textValue={textAnswers[doc.id] ?? doc.text_response ?? ""}
                  onFile={(e) => handleFile(doc.id, e)}
                  onTextChange={(text) =>
                    setTextAnswers((prev) => ({ ...prev, [doc.id]: text }))
                  }
                  onTextSave={(text) => handleTextSave(doc.id, text)}
                />
              ))}
            </ul>
          </CardContent>
        </Card>

        <p className="text-xs text-muted-foreground text-center mt-6">
          Powered by SoftHouse — Sistema interno de Gente & Cultura
        </p>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// DocRow component
// ─────────────────────────────────────────────────────────────────────────────

interface DocRowProps {
  doc: PublicDocumentInfo;
  saving: boolean;
  textValue: string;
  onFile: (e: React.ChangeEvent<HTMLInputElement>) => void;
  onTextChange: (text: string) => void;
  onTextSave: (text: string) => void;
}

function DocRow({
  doc,
  saving,
  textValue,
  onFile,
  onTextChange,
  onTextSave,
}: DocRowProps) {
  const docLabel = getDocumentDisplayLabel(doc);
  const responseType = (() => {
    if (doc.notes?.startsWith("[TEXTO] ")) return "text";
    if (doc.notes?.startsWith("[SIM_NAO] ")) return "yes_no";
    return "file";
  })();

  // Observação: notes pode ter prefixo [TEXTO]/[SIM_NAO], remove antes de parsear
  let cleanNotes = doc.notes;
  if (cleanNotes?.startsWith("[TEXTO] ")) cleanNotes = cleanNotes.slice(8);
  else if (cleanNotes?.startsWith("[SIM_NAO] ")) cleanNotes = cleanNotes.slice(10);

  const observation =
    doc.doc_type === "outro" && cleanNotes && cleanNotes.includes(" — ")
      ? cleanNotes.split(" — ").slice(1).join(" — ")
      : doc.doc_type !== "outro"
      ? cleanNotes
      : null;
  const statusLabel = DOCUMENT_STATUS_LABELS[doc.status] ?? doc.status;

  const statusBadge =
    doc.status === "approved"
      ? "bg-orange-100 text-orange-800 dark:bg-orange-900/30 dark:text-orange-300"
      : doc.status === "needs_adjustment"
      ? "bg-orange-100 text-orange-800 dark:bg-orange-900/30 dark:text-orange-300"
      : doc.status === "submitted" || doc.status === "ai_validating"
      ? "bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300"
      : "bg-muted text-muted-foreground";

  const canEdit =
    doc.status === "pending" || doc.status === "needs_adjustment";

  return (
    <li className="py-4 flex items-start gap-3">
      <div
        className={`w-10 h-10 rounded-lg flex items-center justify-center shrink-0 ${
          doc.status === "approved"
            ? "bg-orange-100 dark:bg-orange-900/30"
            : "bg-muted"
        }`}
      >
        {doc.status === "approved" ? (
          <CheckCircle className="w-5 h-5 text-orange-700 dark:text-orange-300" />
        ) : (
          <FileText className="w-5 h-5 text-muted-foreground" />
        )}
      </div>

      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="font-medium text-foreground">
            {docLabel}
            {doc.required && <span className="text-destructive ml-1">*</span>}
          </span>
          <Badge variant="outline" className={`text-xs font-normal border-0 ${statusBadge}`}>
            {statusLabel}
          </Badge>
        </div>

        {observation && (
          <p className="text-xs text-muted-foreground mt-0.5">{observation}</p>
        )}

        {/* Mostra resposta já enviada */}
        {!canEdit && doc.text_response && (
          <p className="text-sm text-foreground bg-muted/50 p-2 rounded mt-2 whitespace-pre-wrap">
            {doc.text_response}
          </p>
        )}

        {doc.rejection_reason && doc.status === "needs_adjustment" && (
          <p className="text-sm text-orange-700 dark:text-orange-300 bg-orange-50 dark:bg-orange-900/20 p-2 rounded mt-2">
            <strong>Motivo do ajuste:</strong> {doc.rejection_reason}
          </p>
        )}

        {/* Input por tipo — auto-save ao escolher arquivo / digitar / marcar */}
        {canEdit && responseType === "file" && (
          <div className="mt-2 flex items-center gap-3">
            <label className={`cursor-pointer ${saving ? "opacity-60 pointer-events-none" : ""}`}>
              <input
                type="file"
                accept="application/pdf,image/jpeg,image/png,image/webp"
                onChange={onFile}
                className="hidden"
                disabled={saving}
              />
              <span className="inline-flex items-center gap-2 px-3 py-1.5 rounded-md border border-input text-sm hover:bg-muted transition-colors">
                {saving ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <Upload className="w-4 h-4" />
                )}
                {saving
                  ? "Enviando..."
                  : doc.file_url
                  ? "Trocar arquivo"
                  : "Anexar"}
              </span>
            </label>
            {doc.file_name && !saving && (
              <span className="text-xs text-muted-foreground truncate">
                {doc.file_name}
              </span>
            )}
          </div>
        )}

        {canEdit && responseType === "text" && (
          <div className="mt-2 space-y-1">
            <Textarea
              value={textValue}
              onChange={(e) => onTextChange(e.target.value)}
              onBlur={(e) => {
                const v = e.target.value.trim();
                if (v && v !== (doc.text_response ?? "")) onTextSave(v);
              }}
              placeholder="Digite sua resposta aqui..."
              rows={3}
              disabled={saving}
            />
            <p className="text-[11px] text-muted-foreground">
              {saving ? "Salvando..." : "Salva automático ao sair do campo."}
            </p>
          </div>
        )}

        {canEdit && responseType === "yes_no" && (
          <div className="flex items-center gap-3 mt-2">
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="radio"
                name={`yn-${doc.id}`}
                checked={textValue === "Sim"}
                disabled={saving}
                onChange={() => {
                  onTextChange("Sim");
                  onTextSave("Sim");
                }}
              />
              <span className="text-sm">Sim</span>
            </label>
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="radio"
                name={`yn-${doc.id}`}
                checked={textValue === "Não"}
                disabled={saving}
                onChange={() => {
                  onTextChange("Não");
                  onTextSave("Não");
                }}
              />
              <span className="text-sm">Não</span>
            </label>
            {saving && <Loader2 className="w-3.5 h-3.5 animate-spin text-muted-foreground" />}
          </div>
        )}
      </div>
    </li>
  );
}
