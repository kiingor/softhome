import { useEffect, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Badge } from "@/components/ui/badge";
import {
  PaperPlaneRight,
  Plus,
  CircleNotch as Loader2,
  ChartBar,
  ChatCircle,
  Trash,
  Sparkle,
} from "@phosphor-icons/react";
import {
  useAgentSessions,
  useAgentMessages,
  useAnalystChat,
} from "../hooks/use-agent-sessions";
import { ChatMessage } from "../components/ChatMessage";
import type { AnalystMessageMetadata } from "../types";

const SUGGESTIONS = [
  "Quantas admissões em revisão e há quanto tempo?",
  "Como tá a saúde da jornada do time?",
  "Qual o mix de regime do time ativo?",
  "Quais vagas estão demorando mais pra avançar?",
];

export default function AnalistaPage() {
  const queryClient = useQueryClient();
  const [activeSessionId, setActiveSessionId] = useState<string | null>(null);
  const [draft, setDraft] = useState("");
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const scrollEndRef = useRef<HTMLDivElement>(null);

  const { sessions, isLoading: sessionsLoading, archiveSession } =
    useAgentSessions({ agentKind: "analyst" });

  const { data: messages = [], isLoading: messagesLoading } =
    useAgentMessages(activeSessionId);

  const analystChat = useAnalystChat();

  useEffect(() => {
    scrollEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages.length, analystChat.isPending]);

  const handleSend = async (text?: string) => {
    const query = (text ?? draft).trim();
    if (!query) return;
    setDraft("");

    try {
      const result = await analystChat.mutateAsync({
        sessionId: activeSessionId,
        query,
      });
      if (!activeSessionId) setActiveSessionId(result.sessionId);
    } catch {
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

  const isWorking = analystChat.isPending;

  return (
    <div className="h-[calc(100vh-7rem)] flex gap-4">
      {/* Sessões anteriores */}
      <aside className="w-64 shrink-0 flex flex-col">
        <Button onClick={handleNewChat} className="mb-3 w-full" variant="default">
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
            <ChartBar className="w-5 h-5 text-primary" />
          </div>
          <div>
            <h1 className="text-xl font-bold text-foreground">Analista G&C</h1>
            <p className="text-xs text-muted-foreground">
              Pergunta sobre admissão, jornada, recrutamento, time. Trabalho
              só com agregados — sem PII.
            </p>
          </div>
        </div>

        <Card className="flex-1 flex flex-col overflow-hidden">
          <ScrollArea className="flex-1 p-4">
            <div className="space-y-4">
              {!activeSessionId && messages.length === 0 && !isWorking && (
                <div className="text-center py-8">
                  <ChartBar className="w-12 h-12 text-muted-foreground/50 mx-auto mb-3" />
                  <p className="text-sm text-muted-foreground mb-4">
                    Pergunta sobre os números do time. Algumas sugestões:
                  </p>
                  <div className="flex flex-wrap gap-2 justify-center max-w-2xl mx-auto">
                    {SUGGESTIONS.map((s) => (
                      <button
                        key={s}
                        type="button"
                        onClick={() => handleSend(s)}
                        className="text-xs px-3 py-2 rounded-full border border-border bg-card hover:bg-muted transition-colors text-foreground"
                      >
                        {s}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {messagesLoading && (
                <div className="flex items-center justify-center py-8">
                  <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
                </div>
              )}

              {messages.map((msg) => (
                <ChatMessage key={msg.id} message={msg}>
                  {msg.role === "assistant" && (
                    <ToolCallsBadges
                      metadata={msg.metadata as unknown as AnalystMessageMetadata | null}
                    />
                  )}
                </ChatMessage>
              ))}

              {isWorking && (
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <Loader2 className="w-4 h-4 animate-spin" />
                  <span>Consultando os dados...</span>
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
                placeholder="Pergunta sobre os números... (Enter envia, Shift+Enter quebra linha)"
                rows={3}
                disabled={isWorking}
                className="resize-none"
              />
              <Button
                type="button"
                onClick={() => handleSend()}
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

// ─────────────────────────────────────────────────────────────────────────────

function ToolCallsBadges({
  metadata,
}: {
  metadata: AnalystMessageMetadata | null;
}) {
  if (!metadata?.tool_calls || metadata.tool_calls.length === 0) return null;

  const uniqueTools = Array.from(
    new Set(metadata.tool_calls.map((t) => t.tool)),
  );

  return (
    <div className="flex flex-wrap gap-1.5 mt-1">
      {uniqueTools.map((tool) => (
        <Badge key={tool} variant="outline" className="text-xs font-normal gap-1">
          <Sparkle className="w-3 h-3" />
          {TOOL_LABELS[tool] ?? tool}
        </Badge>
      ))}
    </div>
  );
}

const TOOL_LABELS: Record<string, string> = {
  query_company_overview: "Visão da empresa",
  query_admission_funnel: "Funil de admissão",
  query_milestone_overview: "Marcos da jornada",
  query_collaborator_distribution: "Distribuição do time",
  query_recruitment_pipeline: "Pipeline de vagas",
  query_journey_stats: "Estatísticas de insígnias",
};
