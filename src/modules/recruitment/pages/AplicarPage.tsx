import { useEffect, useState } from "react";
import { useParams, Link } from "react-router-dom";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { toast } from "sonner";
import {
  CircleNotch as Loader2,
  Briefcase,
  CheckCircle,
  PaperPlaneRight,
  Upload,
  Warning,
} from "@phosphor-icons/react";
import {
  candidatePublicApplicationSchema,
  type CandidatePublicApplicationValues,
} from "../schemas/recruitment.schema";
import {
  getPublicJobInfo,
  submitApplication,
} from "../services/public-application.service";
import { REGIME_LABELS } from "../types";
import { formatCPFInput, formatPhoneInput } from "@/lib/validators";

interface PublicJob {
  id: string;
  title: string;
  description: string | null;
  requirements: string | null;
  regime: string;
  status: string;
}

export default function AplicarPage() {
  const { jobId } = useParams<{ jobId: string }>();
  const [job, setJob] = useState<PublicJob | null>(null);
  const [loadingJob, setLoadingJob] = useState(true);
  const [cvFile, setCvFile] = useState<File | null>(null);
  const [submitted, setSubmitted] = useState<{
    indexed: boolean;
    message: string;
  } | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const form = useForm<CandidatePublicApplicationValues>({
    resolver: zodResolver(candidatePublicApplicationSchema),
    defaultValues: {
      name: "",
      email: "",
      phone: "",
      cpf: "",
      linkedin_url: "",
      cover_letter: "",
      consent_talent_pool: false,
      consent_lgpd: false,
    },
  });

  useEffect(() => {
    if (!jobId) return;
    (async () => {
      try {
        const data = await getPublicJobInfo(jobId);
        setJob(data);
      } finally {
        setLoadingJob(false);
      }
    })();
  }, [jobId]);

  const handleSubmit = form.handleSubmit(async (values) => {
    if (!cvFile) {
      toast.error("Anexa o currículo (PDF) pra continuar.");
      return;
    }
    if (!jobId) return;

    setSubmitting(true);
    try {
      const result = await submitApplication({
        jobId,
        name: values.name,
        email: values.email,
        phone: values.phone.replace(/\D/g, ""),
        cpf: values.cpf.replace(/\D/g, ""),
        linkedin_url: values.linkedin_url || undefined,
        cover_letter: values.cover_letter || undefined,
        consent_talent_pool: values.consent_talent_pool,
        consent_lgpd: values.consent_lgpd,
        cvFile,
      });
      setSubmitted({ indexed: result.indexed, message: result.message });
    } catch (err) {
      toast.error("Não rolou. " + (err as Error).message);
    } finally {
      setSubmitting(false);
    }
  });

  // Loading state
  if (loadingJob) {
    return (
      <div className="min-h-screen gradient-warm flex items-center justify-center p-6">
        <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  // Vaga não encontrada ou não está aberta
  if (!job || job.status !== "open") {
    return (
      <div className="min-h-screen gradient-warm flex items-center justify-center p-6">
        <Card className="w-full max-w-md">
          <CardContent className="p-8 text-center">
            <div className="w-16 h-16 rounded-2xl bg-muted flex items-center justify-center mx-auto mb-4">
              <Warning className="w-8 h-8 text-muted-foreground" />
            </div>
            <h1 className="text-xl font-bold text-foreground mb-2">
              Vaga não disponível
            </h1>
            <p className="text-muted-foreground mb-6">
              Essa vaga não tá mais aceitando candidaturas. Pode ter sido
              preenchida, pausada ou encerrada.
            </p>
            <Button asChild variant="outline">
              <Link to="/">Voltar</Link>
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  // Sucesso
  if (submitted) {
    return (
      <div className="min-h-screen gradient-warm flex items-center justify-center p-6">
        <Card className="w-full max-w-md">
          <CardContent className="p-8 text-center">
            <div className="w-16 h-16 rounded-2xl bg-emerald-100 dark:bg-emerald-900/30 flex items-center justify-center mx-auto mb-4">
              <CheckCircle className="w-8 h-8 text-emerald-700 dark:text-emerald-300" />
            </div>
            <h1 className="text-xl font-bold text-foreground mb-2">
              Recebemos sua candidatura! 🎉
            </h1>
            <p className="text-muted-foreground mb-2">
              {submitted.message}
            </p>
            <p className="text-sm text-muted-foreground">
              O time de RH vai analisar e te procurar caso seu perfil bata
              com o que a gente tá buscando.
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }

  // Form principal
  return (
    <div className="min-h-screen gradient-warm py-8 px-4">
      <div className="max-w-2xl mx-auto">
        {/* Header SoftHome */}
        <div className="text-center mb-8">
          <div className="inline-flex items-center gap-2 mb-2">
            <div className="w-10 h-10 rounded-xl gradient-hero flex items-center justify-center shadow-soft">
              <span className="text-primary-foreground font-extrabold text-lg">
                S
              </span>
            </div>
            <span className="text-lg font-extrabold tracking-tight text-foreground">
              SoftHome
            </span>
          </div>
        </div>

        {/* Vaga info */}
        <Card className="mb-6">
          <CardHeader>
            <div className="flex items-center gap-3">
              <div className="w-12 h-12 rounded-xl bg-primary/10 flex items-center justify-center">
                <Briefcase className="w-6 h-6 text-primary" />
              </div>
              <div>
                <CardTitle>{job.title}</CardTitle>
                <p className="text-sm text-muted-foreground mt-1">
                  Regime: {REGIME_LABELS[job.regime as keyof typeof REGIME_LABELS] ?? job.regime}
                </p>
              </div>
            </div>
          </CardHeader>
          {(job.description || job.requirements) && (
            <CardContent className="space-y-4">
              {job.description && (
                <div>
                  <h3 className="text-sm font-medium text-foreground mb-1">
                    Sobre a vaga
                  </h3>
                  <p className="text-sm text-muted-foreground whitespace-pre-wrap">
                    {job.description}
                  </p>
                </div>
              )}
              {job.requirements && (
                <div>
                  <h3 className="text-sm font-medium text-foreground mb-1">
                    Requisitos
                  </h3>
                  <p className="text-sm text-muted-foreground whitespace-pre-wrap">
                    {job.requirements}
                  </p>
                </div>
              )}
            </CardContent>
          )}
        </Card>

        {/* Form */}
        <Card>
          <CardHeader>
            <CardTitle>Quero me candidatar</CardTitle>
            <p className="text-sm text-muted-foreground">
              Preenche os dados, anexa o CV e a gente entra em contato.
            </p>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSubmit} className="space-y-5">
              <div className="space-y-2">
                <Label htmlFor="name">Nome completo *</Label>
                <Input id="name" {...form.register("name")} />
                {form.formState.errors.name && (
                  <p className="text-sm text-destructive">
                    {form.formState.errors.name.message}
                  </p>
                )}
              </div>

              <div className="space-y-2">
                <Label htmlFor="email">Email *</Label>
                <Input id="email" type="email" {...form.register("email")} />
                {form.formState.errors.email && (
                  <p className="text-sm text-destructive">
                    {form.formState.errors.email.message}
                  </p>
                )}
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="phone">Telefone *</Label>
                  <Input
                    id="phone"
                    value={form.watch("phone") ?? ""}
                    onChange={(e) =>
                      form.setValue("phone", formatPhoneInput(e.target.value))
                    }
                    placeholder="(11) 99999-9999"
                  />
                  {form.formState.errors.phone && (
                    <p className="text-sm text-destructive">
                      {form.formState.errors.phone.message}
                    </p>
                  )}
                </div>
                <div className="space-y-2">
                  <Label htmlFor="cpf">CPF *</Label>
                  <Input
                    id="cpf"
                    value={form.watch("cpf") ?? ""}
                    onChange={(e) =>
                      form.setValue("cpf", formatCPFInput(e.target.value))
                    }
                    placeholder="000.000.000-00"
                  />
                  {form.formState.errors.cpf && (
                    <p className="text-sm text-destructive">
                      {form.formState.errors.cpf.message}
                    </p>
                  )}
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="linkedin_url">LinkedIn (opcional)</Label>
                <Input
                  id="linkedin_url"
                  type="url"
                  {...form.register("linkedin_url")}
                  placeholder="https://linkedin.com/in/..."
                />
                {form.formState.errors.linkedin_url && (
                  <p className="text-sm text-destructive">
                    {form.formState.errors.linkedin_url.message}
                  </p>
                )}
              </div>

              <div className="space-y-2">
                <Label htmlFor="cover_letter">
                  Carta de apresentação (opcional)
                </Label>
                <Textarea
                  id="cover_letter"
                  {...form.register("cover_letter")}
                  placeholder="Por que essa vaga te interessa?"
                  rows={4}
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="cv">Currículo (PDF, max 5MB) *</Label>
                <div className="flex items-center gap-3">
                  <Input
                    id="cv"
                    type="file"
                    accept="application/pdf"
                    onChange={(e) => setCvFile(e.target.files?.[0] ?? null)}
                    className="cursor-pointer"
                  />
                  {cvFile && (
                    <span className="text-xs text-muted-foreground">
                      {(cvFile.size / 1024).toFixed(0)} KB
                    </span>
                  )}
                </div>
                {!cvFile && (
                  <p className="text-xs text-muted-foreground">
                    Sem CV não dá pra avançar — anexa um PDF.
                  </p>
                )}
              </div>

              <div className="space-y-3 pt-2">
                <label className="flex items-start gap-2 cursor-pointer">
                  <Checkbox
                    checked={form.watch("consent_talent_pool")}
                    onCheckedChange={(v) =>
                      form.setValue("consent_talent_pool", !!v)
                    }
                  />
                  <span className="text-sm text-foreground">
                    Aceito ficar no banco de talentos da Softcom pra futuras
                    vagas.
                  </span>
                </label>
                {form.formState.errors.consent_talent_pool && (
                  <p className="text-sm text-destructive">
                    {form.formState.errors.consent_talent_pool.message}
                  </p>
                )}

                <label className="flex items-start gap-2 cursor-pointer">
                  <Checkbox
                    checked={form.watch("consent_lgpd")}
                    onCheckedChange={(v) => form.setValue("consent_lgpd", !!v)}
                  />
                  <span className="text-sm text-foreground">
                    Concordo que meus dados sejam tratados pela Softcom
                    conforme a LGPD pra processo seletivo.
                  </span>
                </label>
                {form.formState.errors.consent_lgpd && (
                  <p className="text-sm text-destructive">
                    {form.formState.errors.consent_lgpd.message}
                  </p>
                )}
              </div>

              <Button
                type="submit"
                size="lg"
                className="w-full"
                disabled={submitting || !cvFile}
              >
                {submitting ? (
                  <>
                    <Loader2 className="w-5 h-5 mr-2 animate-spin" />
                    Enviando...
                  </>
                ) : (
                  <>
                    <PaperPlaneRight className="w-5 h-5 mr-2" />
                    Enviar candidatura
                  </>
                )}
              </Button>
            </form>
          </CardContent>
        </Card>

        <p className="text-xs text-muted-foreground text-center mt-6">
          Powered by SoftHome — Sistema interno de Gente & Cultura
        </p>
      </div>
    </div>
  );
}
