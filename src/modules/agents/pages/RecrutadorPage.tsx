import { useEffect, useMemo, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  PaperPlaneRight,
  Plus,
  CircleNotch as Loader2,
  Robot,
  ChatCircle,
  Trash,
} from "@phosphor-icons/react";
import {
  useAgentSessions,
  useAgentMessages,
  useRecruiterSearch,
} from "../hooks/use-agent-sessions";
import { CandidateMatchCard } from "../components/CandidateMatchCard";
import { ChatMessage } from "../components/ChatMessage";
import type { CandidateMatch, RecruiterMessageMetadata } from "../types";

interface InFlightAssistantSummary {
  candidates: CandidateMatch[];
}

export default function RecrutadorPage() {
  const queryClient = useQueryClient();
  const [activeSessionId, setActiveSessionId] = useState<string | null>(null);
  const [draft, setDraft] = useState("");
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const scrollEndRef = useRef<HTMLDivElement>(null);

  // Cache local de candidatos retornados pra cada assistant message do CURRENT
  // session. Ao recarregar/trocar de session, candidatos vêm de
  // metadata.candidates (com {id, similarity}) — buscar dados completos sob demanda.
  const [candidatesByMessage, setCandidatesByMessage] = useState<
    Record<string, InFlightAssistantSummary>
  >({});

  const { sessions, isLoading: sessionsLoading, archiveSession } =
    useAgentSessions({ agentKind: "recruiter" });

  const { data: messages = [], isLoading: messagesLoading } =
    useAgentMessages(activeSessionId);

  const recruiterSearch = useRecruiterSearch();

  // Auto-scroll pro fim quando mensagens mudam
  useEffect(() => {
    scrollEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages.length, recruiterSearch.isPending]);

  // Quando troca de session, busca candidatos das messages metadata
  useEffect(() => {
    if (!activeSessionId || messages.length === 0) return;
    const assistantMessages = messages.filter((m) => m.role === "assistant");
    const toFetch: string[] = [];
    for (const m of assistantMessages) {
      if (candidatesByMessage[m.id]) continue;
      const meta = m.metadata as RecruiterMessageMetadata | null;
      if (meta?.candidates) {
        toFetch.push(m.id);
      }
    }
    if (toFetch.length === 0) return;

    // Busca dados dos candidatos
    (async () => {
      const ids = new Set<string>();
      for (const id of toFetch) {
        const m = assistantMessages.find((x) => x.id === id);
        const meta = m?.metadata as RecruiterMessageMetadata | null;
        meta?.candidates?.forEach((c) => ids.add(c.id));
      }
      if (ids.size === 0) return;

      const { data } = await supabase
        .from("candidates")
        .select(
          "id, name, email, phone, linkedin_url, cv_url, cv_summary, source, is_active",
        )
        .in("id", Array.from(ids));

      const byId = new Map((data ?? []).map((c) => [c.id, c]));

      setCandidatesByMessage((prev) => {
        const next = { ...prev };
        for (const id of toFetch) {
          const m = assistantMessages.find((x) => x.id === id);
          const meta = m?.metadata as RecruiterMessageMetadata | null;
          if (!meta?.candidates) continue;
          next[id] = {
            candidates: meta.candidates
              .map((entry) => {
                const c = byId.get(entry.id);
                if (!c) return null;
                return { ...c, similarity: entry.similarity } as CandidateMatch;
              })
              .filter(Boolean) as CandidateMatch[],
          };
        }
        return next;
      });
    })();
  }, [activeSessionId, messages, candidatesByMessage]);

  const handleSend = async () => {
    const query = draft.trim();
    if (!query) return;
    setDraft("");

    try {
      const result = await recruiterSearch.mutateAsync({
        sessionId: activeSessionId,
        query,
      });
      // Define active session se foi criada agora
      if (!activeSessionId) setActiveSessionId(result.sessionId);

      // Cache os candidatos da assistant message recém criada
      setCandidatesByMessage((prev) => ({
        ...prev,
        [result.assistantMessageId]: { candidates: result.candidates },
      }));
    } catch {
      // toast é feito no hook; volta o draft pro user editar
      setDraft(query);
    }
  };

  const handleNewChat = () => {
    setActiveSessionId(null);
    setDraft("");
    inputRef.current?.focus();
  };

  const onKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const handleArchive = async (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    await archiveSession.mutateAsync(id);
    if (activeSessionId === id) {
      setActiveSessionId(null);
      queryClient.invalidateQueries({ queryKey: ["agent-messages"] });
    }
  };

  const isWorking = recruiterSearch.isPending;

  return (
    <div className="h-[calc(100vh-7rem)] flex gap-4">
      {/* Sessões anteriores */}
      <aside className="w-64 shrink-0 flex flex-col">
        <Button
          onClick={handleNewChat}
          className="mb-3 w-full"
          variant="default"
        >
          <Plus className="w-4 h-4 mr-2" />
          Nova conversa
        </Button>

        <Card className="flex-1 overflow-hidden">
          <CardContent className="p-2">
            {sessionsLoading ? (
              <div className="flex items-center justify-center py-8">
                <Loader2 className="w-4 h-4 animate-spin text-muted-foreground" />
              </div>
            ) : sessions.length === 0 ? (
              <p className="text-xs text-muted-foreground text-center py-4 px-2">
                Sem conversas ainda. Pergunta algo aí 👇
              </p>
            ) : (
              <ScrollArea className="h-[calc(100vh-15rem)]">
                <ul className="space-y-1">
                  {sessions.map((s) => (
                    <li key={s.id}>
                      <button
                        type="button"
                        onClick={() => setActiveSessionId(s.id)}
                        className={`w-full text-left text-sm rounded-md px-2 py-2 transition-colors group flex items-center gap-2 ${
                          s.id === activeSessionId
                            ? "bg-primary/10 text-primary"
                            : "hover:bg-muted text-foreground"
                        }`}
                      >
                        <ChatCircle className="w-4 h-4 shrink-0" />
                        <span className="truncate flex-1">
                          {s.title ?? "(sem título)"}
                        </span>
                        <button
                          type="button"
                          onClick={(e) => handleArchive(s.id, e)}
                          className="opacity-0 group-hover:opacity-100 text-muted-foreground hover:text-destructive transition"
                          title="Arquivar"
                        >
                          <Trash className="w-3 h-3" />
                        </button>
                      </button>
                    </li>
                  ))}
                </ul>
              </ScrollArea>
            )}
          </CardContent>
        </Card>
      </aside>

      {/* Chat */}
      <div className="flex-1 flex flex-col min-w-0">
        <div className="flex items-center gap-3 mb-3">
          <div className="w-10 h-10 rounded-full bg-primary/20 flex items-center justify-center">
            <Robot className="w-5 h-5 text-primary" />
          </div>
          <div>
            <h1 className="text-xl font-bold text-foreground">Recrutador</h1>
            <p className="text-xs text-muted-foreground">
              Descreve a vaga e eu busco no banco de talentos.
            </p>
          </div>
        </div>

        <Card className="flex-1 flex flex-col overflow-hidden">
          <ScrollArea className="flex-1 p-4">
            <div className="space-y-4">
              {!activeSessionId && messages.length === 0 && !isWorking && (
                <div className="text-center py-12">
                  <Robot className="w-12 h-12 text-muted-foreground/50 mx-auto mb-3" />
                  <p className="text-sm text-muted-foreground mb-2">
                    Manda a vaga que tu tá procurando.
                  </p>
                  <p className="text-xs text-muted-foreground max-w-md mx-auto">
                    Ex: "Preciso de um(a) dev backend Python pleno com
                    experiência em PostgreSQL e mensageria, regime CLT,
                    remoto SP."
                  </p>
                </div>
              )}

              {messagesLoading && (
                <div className="flex items-center justify-center py-8">
                  <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
                </div>
              )}

              {messages.map((msg) => (
                <ChatMessage key={msg.id} message={msg}>
                  {msg.role === "assistant" &&
                    candidatesByMessage[msg.id]?.candidates.map((c, i) => (
                      <CandidateMatchCard
                        key={c.id}
                        candidate={c}
                        rank={i + 1}
                      />
                    ))}
                </ChatMessage>
              ))}

              {isWorking && (
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <Loader2 className="w-4 h-4 animate-spin" />
                  <span>Buscando no banco de talentos...</span>
                </div>
              )}

              <div ref={scrollEndRef} />
            </div>
          </ScrollArea>

          {/* Input */}
          <div className="border-t border-border p-3">
            <div className="flex gap-2 items-end">
              <Textarea
                ref={inputRef}
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                onKeyDown={onKeyDown}
                placeholder="Descreve a vaga... (Enter envia, Shift+Enter quebra linha)"
                rows={3}
                disabled={isWorking}
                className="resize-none"
              />
              <Button
                type="button"
                onClick={handleSend}
                disabled={isWorking || !draft.trim()}
                className="shrink-0"
              >
                {isWorking ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <PaperPlaneRight className="w-4 h-4" />
                )}
              </Button>
            </div>
          </div>
        </Card>
      </div>
    </div>
  );
}
