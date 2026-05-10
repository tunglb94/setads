"use client";
import { useState, useRef, useCallback } from "react";
import { Brain, Sparkles, ChevronDown, ChevronRight, X, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { getAuthToken } from "@/services/api";

interface Props {
  adId: string;
  adName: string;
  onClose: () => void;
}

interface SSEEvent {
  type: "reasoning" | "content" | "done" | "error";
  content?: string;
  message?: string;
}

export function LiveAnalyzerPanel({ adId, adName, onClose }: Props) {
  const token = getAuthToken();
  const [thinkingText, setThinkingText] = useState("");
  const [finalText, setFinalText] = useState("");
  const [streaming, setStreaming] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState("");
  const [thinkOpen, setThinkOpen] = useState(true);
  const abortRef = useRef<AbortController | null>(null);

  const start = useCallback(async () => {
    setThinkingText("");
    setFinalText("");
    setError("");
    setDone(false);
    setStreaming(true);
    setThinkOpen(true);

    const ctrl = new AbortController();
    abortRef.current = ctrl;

    try {
      const base = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000/api";
      const res = await fetch(
        `${base}/ai_analyzer/stream/?ad_id=${encodeURIComponent(adId)}`,
        {
          headers: { Authorization: `Token ${token}` },
          signal: ctrl.signal,
        }
      );

      if (!res.ok || !res.body) {
        setError(`HTTP ${res.status}`);
        setStreaming(false);
        return;
      }

      const reader = res.body.pipeThrough(new TextDecoderStream()).getReader();
      let lineBuf = "";

      while (true) {
        const { value, done: rdone } = await reader.read();
        if (rdone) break;

        lineBuf += value;
        const lines = lineBuf.split("\n");
        lineBuf = lines.pop() ?? "";

        for (const line of lines) {
          if (!line.startsWith("data: ")) continue;
          try {
            const ev: SSEEvent = JSON.parse(line.slice(6));
            if (ev.type === "reasoning") {
              setThinkingText((t) => t + (ev.content ?? ""));
            } else if (ev.type === "content") {
              setFinalText((t) => t + (ev.content ?? ""));
            } else if (ev.type === "done") {
              setDone(true);
              setStreaming(false);
              setThinkOpen(false);
            } else if (ev.type === "error") {
              setError(ev.message ?? "Lỗi không xác định");
              setStreaming(false);
            }
          } catch {
            // malformed SSE line, skip
          }
        }
      }
    } catch (err: unknown) {
      if ((err as Error).name !== "AbortError") {
        setError(String(err));
      }
      setStreaming(false);
    }
  }, [adId, token]);

  const stop = () => {
    abortRef.current?.abort();
    setStreaming(false);
  };

  const idle = !streaming && !done && !error && !finalText;

  return (
    <div className="border border-violet-200 rounded-xl bg-white shadow-md overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 bg-gradient-to-r from-violet-600 to-purple-700">
        <div className="flex items-center gap-2">
          <Brain className={cn("h-4 w-4 text-white", streaming && "animate-pulse")} />
          <span className="text-sm font-semibold text-white truncate max-w-[260px]">{adName}</span>
          {streaming && (
            <span className="text-xs text-violet-200 animate-pulse">Đang phân tích...</span>
          )}
          {done && (
            <span className="text-xs bg-emerald-500 text-white px-2 py-0.5 rounded-full">Hoàn thành</span>
          )}
        </div>
        <div className="flex items-center gap-2">
          {streaming ? (
            <Button
              size="sm"
              variant="ghost"
              className="h-7 px-2 text-white hover:bg-white/20 text-xs"
              onClick={stop}
            >
              Dừng
            </Button>
          ) : (
            <Button
              size="sm"
              variant="ghost"
              className="h-7 px-2 text-white hover:bg-white/20 text-xs gap-1"
              onClick={start}
            >
              {done ? (
                <><Sparkles className="h-3 w-3" />Phân tích lại</>
              ) : (
                <><Sparkles className="h-3 w-3" />Bắt đầu phân tích</>
              )}
            </Button>
          )}
          <button onClick={onClose} className="text-white/70 hover:text-white transition-colors">
            <X className="h-4 w-4" />
          </button>
        </div>
      </div>

      <div className="p-4 space-y-3 max-h-[520px] overflow-y-auto">
        {/* Idle state */}
        {idle && (
          <div className="py-10 text-center">
            <Brain className="h-10 w-10 mx-auto text-violet-200 mb-3" />
            <p className="text-sm text-gray-400">Nhấn <span className="font-semibold text-violet-600">Bắt đầu phân tích</span> để AI đọc sâu vào dữ liệu quảng cáo này.</p>
          </div>
        )}

        {/* Error */}
        {error && (
          <div className="rounded-lg bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-700">
            {error}
          </div>
        )}

        {/* Thinking accordion */}
        {thinkingText && (
          <div className="rounded-lg border border-gray-200 overflow-hidden">
            <button
              onClick={() => setThinkOpen((o) => !o)}
              className="w-full flex items-center gap-2 px-3 py-2 bg-gray-50 hover:bg-gray-100 transition-colors text-left"
            >
              <Brain className={cn("h-3.5 w-3.5 text-gray-400 shrink-0", streaming && !done && "animate-pulse text-violet-500")} />
              <span className="text-xs font-semibold text-gray-500 uppercase tracking-wide flex-1">
                Chain-of-thought {streaming && !done ? "(đang suy luận...)" : "(hoàn thành)"}
              </span>
              {thinkOpen
                ? <ChevronDown className="h-3.5 w-3.5 text-gray-400" />
                : <ChevronRight className="h-3.5 w-3.5 text-gray-400" />
              }
            </button>
            {thinkOpen && (
              <div className="px-3 py-2 bg-gray-50/50 border-t border-gray-100">
                <p className="text-xs text-gray-400 italic whitespace-pre-wrap leading-relaxed font-mono">
                  {thinkingText}
                  {streaming && !done && <span className="inline-block w-1 h-3 bg-violet-400 animate-pulse ml-0.5 align-middle" />}
                </p>
              </div>
            )}
          </div>
        )}

        {/* Final answer */}
        {finalText && (
          <div className="rounded-lg border border-violet-100 bg-violet-50/30 p-4">
            <div className="flex items-center gap-2 mb-2">
              <Sparkles className="h-3.5 w-3.5 text-violet-600" />
              <span className="text-xs font-semibold text-violet-700 uppercase tracking-wide">Phân tích & Quyết định</span>
            </div>
            <div className="text-sm text-gray-800 whitespace-pre-wrap leading-relaxed">
              {finalText}
              {streaming && <span className="inline-block w-1 h-4 bg-violet-500 animate-pulse ml-0.5 align-middle" />}
            </div>
          </div>
        )}

        {/* Streaming spinner when no output yet */}
        {streaming && !thinkingText && !finalText && (
          <div className="py-8 flex flex-col items-center gap-3">
            <Loader2 className="h-8 w-8 text-violet-500 animate-spin" />
            <p className="text-sm text-gray-400">Đang kết nối LLM...</p>
          </div>
        )}
      </div>
    </div>
  );
}
