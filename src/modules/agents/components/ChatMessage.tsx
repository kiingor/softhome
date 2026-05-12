import { Card, CardContent } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { Robot, User } from "@phosphor-icons/react";
import ReactMarkdown from "react-markdown";
import type { AgentMessage } from "../types";

interface ChatMessageProps {
  message: AgentMessage;
  children?: React.ReactNode; // pra renderizar candidate cards quando role=assistant
}

export function ChatMessage({ message, children }: ChatMessageProps) {
  const isUser = message.role === "user";
  const isAssistant = message.role === "assistant";

  return (
    <div
      className={cn(
        "flex gap-3 items-start",
        isUser ? "flex-row-reverse" : "flex-row"
      )}
    >
      <div
        className={cn(
          "w-8 h-8 rounded-full flex items-center justify-center shrink-0",
          isUser
            ? "bg-primary/20 text-primary"
            : "bg-muted text-muted-foreground"
        )}
      >
        {isUser ? <User className="w-4 h-4" /> : <Robot className="w-4 h-4" />}
      </div>

      <div
        className={cn(
          "flex flex-col min-w-0 max-w-[80%]",
          isUser ? "items-end" : "items-start"
        )}
      >
        <Card
          className={cn(
            "max-w-full",
            isUser
              ? "bg-primary text-primary-foreground border-primary"
              : "bg-card"
          )}
        >
          <CardContent className="p-3">
            {isUser ? (
              <p className="text-sm whitespace-pre-wrap break-words">
                {message.content}
              </p>
            ) : (
              <div className="text-sm prose prose-sm max-w-none break-words prose-p:my-1 prose-ul:my-1 prose-ol:my-1 prose-li:my-0 prose-headings:my-2 prose-headings:font-semibold prose-strong:font-semibold prose-code:bg-muted prose-code:px-1 prose-code:py-0.5 prose-code:rounded prose-code:text-xs prose-code:before:content-none prose-code:after:content-none">
                <ReactMarkdown>{message.content}</ReactMarkdown>
              </div>
            )}
          </CardContent>
        </Card>

        {isAssistant && children && (
          <div className="mt-3 space-y-2 w-full">{children}</div>
        )}

        <p className="text-xs text-muted-foreground mt-1 px-1">
          {new Date(message.created_at).toLocaleString("pt-BR", {
            hour: "2-digit",
            minute: "2-digit",
            day: "2-digit",
            month: "short",
          })}
        </p>
      </div>
    </div>
  );
}
