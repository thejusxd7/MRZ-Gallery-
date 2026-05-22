import React, { useRef, useEffect, useState } from "react";
import { LogEntry } from "../types";
import { Terminal, Trash2, Search, ArrowDown } from "lucide-react";

interface LogConsoleProps {
  logs: LogEntry[];
}

export const LogConsole: React.FC<LogConsoleProps> = ({ logs }) => {
  const [filterText, setFilterText] = useState("");
  const consoleEndRef = useRef<HTMLDivElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [isScrolledToBottom, setIsScrolledToBottom] = useState(true);

  const filteredLogs = logs.filter((log) =>
    log.message.toLowerCase().includes(filterText.toLowerCase()) ||
    log.level.toLowerCase().includes(filterText.toLowerCase())
  );

  const scrollToBottom = () => {
    consoleEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  // Determine if user has scrolled away from the bottom
  const handleScroll = () => {
    if (!containerRef.current) return;
    const { scrollTop, scrollHeight, clientHeight } = containerRef.current;
    // Allow minor threshold variance
    const isAtBottom = scrollHeight - scrollTop - clientHeight < 15;
    setIsScrolledToBottom(isAtBottom);
  };

  useEffect(() => {
    if (isScrolledToBottom) {
      scrollToBottom();
    }
  }, [logs, isScrolledToBottom]);

  return (
    <div className="bg-[#050505] border border-amber-500/10 rounded-xl overflow-hidden flex flex-col h-[320px] shadow-lg relative">
      {/* Console Header */}
      <div className="bg-[#0c0c0c] px-4 py-2.5 flex items-center justify-between border-b border-amber-500/10">
        <label className="text-xs font-semibold text-slate-300 flex items-center gap-1.5 font-mono">
          <Terminal className="w-3.5 h-3.5 text-amber-500 animate-pulse" />
          <span>Gateway Console Logs</span>
        </label>
        
        {/* Simple Filter input */}
        <div className="relative flex items-center">
          <input
            type="text"
            value={filterText}
            onChange={(e) => setFilterText(e.target.value)}
            placeholder="Search logs..."
            className="bg-white/5 border border-amber-500/10 text-[10px] text-amber-200/80 rounded px-2 py-1 pr-6 outline-none focus:border-amber-500 font-mono"
          />
          <Search className="w-3 h-3 text-amber-400/50 absolute right-2" />
        </div>
      </div>

      {/* Terminal View scroll area */}
      <div
        ref={containerRef}
        onScroll={handleScroll}
        className="flex-1 overflow-y-auto p-4 space-y-1.5 font-mono text-[11px] leading-relaxed scrollbar-thin scrollbar-thumb-slate-800"
      >
        {filteredLogs.length === 0 ? (
          <p className="text-slate-600 italic py-2 text-center">
            No system log records fit this filter.
          </p>
        ) : (
          filteredLogs.slice().reverse().map((log, index) => {
            const levelColors = {
              info: "text-slate-300",
              warn: "text-amber-400 font-medium",
              error: "text-red-400 font-bold"
            }[log.level] || "text-slate-400";

            const prefixSymbol = {
              info: "✦",
              warn: "⚠",
              error: "✗"
            }[log.level] || "•";

            const formattedTimestamp = new Date(log.timestamp).toLocaleTimeString([], {
              hour12: false,
              hour: "2-digit",
              minute: "2-digit",
              second: "2-digit"
            });

            return (
              <div key={index} className="flex gap-2 hover:bg-white/5 py-0.5 px-1 rounded transition-colors break-words">
                <span className="text-slate-500 select-none">
                  [{formattedTimestamp}]
                </span>
                <span className={`flex-shrink-0 select-none ${levelColors}`}>
                  {prefixSymbol}
                </span>
                <span className={levelColors}>
                  {log.message}
                </span>
              </div>
            );
          })
        )}
        <div ref={consoleEndRef} />
      </div>

      {/* Scrolled To Bottom Tracker Button overlay */}
      {!isScrolledToBottom && filteredLogs.length > 0 && (
        <button
          onClick={scrollToBottom}
          className="absolute bottom-3 right-3 btn-gel-primary rounded-full p-1.5 shadow-md flex items-center justify-center cursor-pointer transition-all hover:scale-105"
          title="Scroll to modern logs"
        >
          <ArrowDown className="w-3.5 h-3.5 text-amber-950" />
        </button>
      )}
    </div>
  );
};
