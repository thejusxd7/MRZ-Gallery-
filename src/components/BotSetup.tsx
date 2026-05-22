import React, { useState } from "react";
import { AlertTriangle, Trash2 } from "lucide-react";
import { motion, AnimatePresence } from "motion/react";

interface BotSetupProps {
  config: any;
  status: any;
  onSaveConfig: (token: string, channelId: string) => Promise<boolean>;
  onClearBoard: () => Promise<void> | void;
}

export const BotSetup: React.FC<BotSetupProps> = ({ onClearBoard }) => {
  // Danger/purge confirms state
  const [showPurgeConfirm, setShowPurgeConfirm] = useState(false);

  return (
    <div className="space-y-6">
      {/* Dynamic Status Banner */}
      <div className="p-4 rounded-xl border border-emerald-200 bg-emerald-50 transition-all duration-300 relative overflow-hidden" id="bot-status-banner">
        <div className="flex items-start gap-3">
          <div className="mt-1 flex-shrink-0">
            <span className="flex h-2.5 w-2.5 rounded-full bg-emerald-500" />
          </div>
          <div>
            <h3 className="text-xs font-bold font-mono uppercase tracking-wider text-slate-500">
              System Dispatch Board Status
            </h3>
            <p className="text-sm font-semibold text-slate-800 capitalize mt-0.5">
              Admin Web Gateway: Active
            </p>
            <p className="text-xs text-slate-500 mt-1 leading-relaxed">
              Operator login and real-time custom message broadcasts are fully online.
            </p>
          </div>
        </div>
      </div>

      {/* Danger Zone Purge Controls */}
      <div className="bg-red-50/45 border border-red-100 rounded-xl p-5 space-y-3.5" id="danger-zone-purge">
        <div>
          <h3 className="text-xs font-bold font-display text-red-800 uppercase tracking-widest flex items-center gap-1.5">
            <AlertTriangle className="w-4 h-4 text-red-600" />
            <span>Danger &amp; Purge Zone</span>
          </h3>
          <p className="text-[11px] text-red-600/80 leading-relaxed mt-1">
            Remove all synced message feeds from firestore database and memory instantly.
          </p>
        </div>

        <AnimatePresence mode="wait">
          {!showPurgeConfirm ? (
            <button
              onClick={() => setShowPurgeConfirm(true)}
              className="w-full flex items-center gap-1.5 justify-center py-2.5 px-4 bg-red-600 hover:bg-red-755 active:bg-red-800 text-white text-xs font-bold rounded-lg shadow-2xs hover:shadow-xs transition-all cursor-pointer"
            >
              <Trash2 className="w-4 h-4" />
              <span>Clear All Messages</span>
            </button>
          ) : (
            <motion.div
              initial={{ opacity: 0, y: -8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
              className="bg-white border border-red-200 rounded-xl p-4 space-y-3 shadow-md"
            >
              <div className="flex gap-2">
                <AlertTriangle className="w-4.5 h-4.5 text-red-500 flex-shrink-0 mt-0.5" />
                <p className="text-[11px] font-semibold text-slate-800 leading-snug">
                  Are you absolutely sure? This will permanently wipe all synchronized feeds.
                </p>
              </div>
              <div className="flex gap-2 text-xs">
                <button
                  type="button"
                  onClick={() => setShowPurgeConfirm(false)}
                  className="flex-1 py-2 px-3 border border-slate-200 hover:bg-slate-50 text-slate-600 font-semibold rounded-lg transition-all cursor-pointer bg-white"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={async () => {
                    await onClearBoard();
                    setShowPurgeConfirm(false);
                  }}
                  className="flex-1 py-2 px-3 bg-red-600 hover:bg-red-700 text-white font-semibold rounded-lg transition-all cursor-pointer shadow-xs"
                >
                  Yes, Purge Feed
                </button>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
};
