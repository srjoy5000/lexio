import { useState, useEffect, useRef } from "react";
import { db } from "../db";

type Phase = "idle" | "work" | "break";

interface PomodoroTimerProps {
  workMinutes?: number;
  breakMinutes?: number;
  lang?: string;
}

export default function PomodoroTimer({ workMinutes = 25, breakMinutes = 5, lang = "en" }: PomodoroTimerProps) {
  const [phase, setPhase] = useState<Phase>("idle");
  const [secondsLeft, setSecondsLeft] = useState(workMinutes * 60);
  const [running, setRunning] = useState(false);
  const [sessionStart, setSessionStart] = useState<number | null>(null);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const totalSeconds = phase === "break" ? breakMinutes * 60 : workMinutes * 60;

  useEffect(() => {
    if (!running) return;
    intervalRef.current = setInterval(() => {
      setSecondsLeft((prev) => {
        if (prev <= 1) {
          clearInterval(intervalRef.current!);
          handlePhaseEnd();
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
    return () => { if (intervalRef.current) clearInterval(intervalRef.current); };
  }, [running, phase]);

  const handlePhaseEnd = async () => {
    setRunning(false);
    if (phase === "work" && sessionStart) {
      await db.studySessions.add({ start: sessionStart, end: Date.now(), lang });
      if ("Notification" in window && Notification.permission === "granted") {
        new Notification("Pomodoro complete! Time for a break.");
      }
      setPhase("break");
      setSecondsLeft(breakMinutes * 60);
    } else {
      setPhase("idle");
      setSecondsLeft(workMinutes * 60);
    }
    setSessionStart(null);
  };

  const handleStart = () => {
    if (phase === "idle") {
      setPhase("work");
      setSecondsLeft(workMinutes * 60);
      setSessionStart(Date.now());
    }
    setRunning(true);
    if ("Notification" in window && Notification.permission === "default") {
      Notification.requestPermission();
    }
  };

  const handlePause = () => setRunning(false);

  const handleReset = () => {
    setRunning(false);
    if (intervalRef.current) clearInterval(intervalRef.current);
    setPhase("idle");
    setSecondsLeft(workMinutes * 60);
    setSessionStart(null);
  };

  const progress = 1 - secondsLeft / totalSeconds;
  const radius = 28;
  const circumference = 2 * Math.PI * radius;
  const strokeDashoffset = circumference * (1 - progress);

  const minutes = Math.floor(secondsLeft / 60);
  const seconds = secondsLeft % 60;
  const timeStr = `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;

  const phaseColor = phase === "work" ? "#10b981" : phase === "break" ? "#3b82f6" : "#6b7280";

  return (
    <div className="fixed bottom-24 right-6 z-40 bg-white dark:bg-dark-surface border border-gray-200 dark:border-dark-hover rounded-2xl shadow-xl p-3 flex flex-col items-center gap-2 select-none"
      style={{ minWidth: 120 }}>
      <div className="text-[9px] font-black uppercase tracking-widest text-gray-400 dark:text-dark-muted">
        {phase === "idle" ? "Pomodoro" : phase === "work" ? "Focus" : "Break"}
      </div>

      {/* Circular progress */}
      <div className="relative w-16 h-16 flex items-center justify-center">
        <svg className="absolute inset-0" width="64" height="64" viewBox="0 0 64 64">
          <circle cx="32" cy="32" r={radius} fill="none" stroke="currentColor" strokeWidth="4"
            className="text-gray-200 dark:text-dark-hover" />
          <circle cx="32" cy="32" r={radius} fill="none" stroke={phaseColor} strokeWidth="4"
            strokeLinecap="round"
            strokeDasharray={circumference}
            strokeDashoffset={strokeDashoffset}
            style={{ transition: "stroke-dashoffset 1s linear", transform: "rotate(-90deg)", transformOrigin: "center" }}
          />
        </svg>
        <span className="text-xs font-black text-gray-800 dark:text-white z-10">{timeStr}</span>
      </div>

      {/* Controls */}
      <div className="flex gap-1">
        {!running ? (
          <button
            onClick={handleStart}
            className="px-3 py-1 bg-green-600 hover:bg-green-700 text-white rounded-lg text-xs font-bold transition-all"
          >
            {phase === "idle" ? "Start" : "Resume"}
          </button>
        ) : (
          <button
            onClick={handlePause}
            className="px-3 py-1 bg-amber-500 hover:bg-amber-600 text-white rounded-lg text-xs font-bold transition-all"
          >
            Pause
          </button>
        )}
        <button
          onClick={handleReset}
          className="px-2 py-1 bg-gray-100 dark:bg-dark-hover hover:bg-gray-200 text-gray-600 dark:text-gray-300 rounded-lg text-xs font-bold transition-all"
        >
          ↺
        </button>
      </div>
    </div>
  );
}
