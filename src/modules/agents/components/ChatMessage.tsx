import { Card, CardContent } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { Robot, User } from "@phosphor-icons/react";
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
            <p className="text-sm whitespace-pre-wrap break-words">
              {message.content}
            </p>
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
