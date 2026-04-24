import { forwardRef } from "react";
import { CheckCircle } from "lucide-react";
import type { PosEntry } from "../lib/types";

interface QuickTooltipProps {
  visible: boolean;
  pos: { x: number; y: number };
  loading: boolean;
  error: string | null;
  data: { original: string; meanings: PosEntry[] } | null;
  /** Whether the looked-up word already has a saved flashcard. */
  hasFlashcard?: boolean;
  /** Whether the word is already in the known-words list. */
  isKnown?: boolean;
  /** Called when the user clicks "View Card". */
  onViewFlashcard?: () => void;
  /** Called when the user clicks "Mark as known" or "Unmark". */
  onToggleKnown?: () => void;
}

/**
 * Floating word-lookup tooltip shown when the user clicks a word or selects text.
 * The ref is forwarded so the parent can detect outside-clicks.
 */
const QuickTooltip = forwardRef<HTMLDivElement, QuickTooltipProps>(
  (
    {
      visible,
      pos,
      loading,
      error,
      data,
      hasFlashcard,
      isKnown,
      onViewFlashcard,
      onToggleKnown,
    },
    ref,
  ) => {
    if (!visible) return null;

    return (
      <div
        ref={ref}
        style={{ position: "fixed", left: pos.x, top: pos.y, zIndex: 9999 }}
        className="bg-white dark:bg-dark-surface border border-gray-200 dark:border-dark-hover shadow-2xl rounded-lg p-4 max-w-[280px] w-max"
        onMouseDown={(e) => e.stopPropagation()}
      >
        {loading ? (
          <p className="text-gray-400 dark:text-gray-500 text-sm font-medium animate-pulse">
            Looking up…
          </p>
        ) : error ? (
          <p className="text-red-500 text-sm">{error}</p>
        ) : data ? (
          <div>
            <div className="border-b border-gray-100 dark:border-dark-hover pb-2 mb-2">
              <span className="font-bold text-gray-900 dark:text-white text-lg">
                {data.original}
              </span>
            </div>
            <div className="space-y-1.5">
              {data.meanings.map((m, i) => (
                <div key={i} className="flex items-start text-sm">
                  {m.pos && (
                    <span className="text-[10px] font-semibold text-indigo-600 dark:text-indigo-300 bg-indigo-50 dark:bg-indigo-900/30 px-1.5 py-0.5 rounded mr-2 mt-0.5 uppercase tracking-wider shrink-0">
                      {m.pos}
                    </span>
                  )}
                  <span className="text-gray-800 dark:text-gray-200 font-medium">
                    {m.translations}
                  </span>
                </div>
              ))}
            </div>
            <div className="mt-3 flex gap-2">
              {onToggleKnown && (
                <button
                  onClick={onToggleKnown}
                  className={`flex-1 flex items-center justify-center gap-1.5 py-1.5 rounded-lg text-xs font-bold transition-all ${
                    isKnown
                      ? "bg-gray-100 dark:bg-dark-hover text-gray-500 dark:text-gray-400 hover:bg-red-50 dark:hover:bg-red-900/20 hover:text-red-500"
                      : "bg-emerald-50 dark:bg-emerald-900/20 text-emerald-700 dark:text-emerald-400 hover:bg-emerald-100 dark:hover:bg-emerald-900/40"
                  }`}
                  title={
                    isKnown ? "Unmark as known" : "Mark as known (Alt+click)"
                  }
                >
                  {isKnown ? (
                    <>
                      <CheckCircle size={13} /> Unmark
                    </>
                  ) : (
                    <>
                      <CheckCircle size={13} /> Mark known
                    </>
                  )}
                </button>
              )}
              {hasFlashcard && onViewFlashcard && (
                <button
                  onClick={onViewFlashcard}
                  className="flex-1 flex items-center justify-center gap-1.5 py-1.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg text-xs font-bold transition-all"
                >
                  → View Card
                </button>
              )}
            </div>
          </div>
        ) : null}
      </div>
    );
  },
);

QuickTooltip.displayName = "QuickTooltip";
export default QuickTooltip;
