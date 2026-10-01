'use client';

import { createContext, useContext, useState, useCallback, type ReactNode } from 'react';

interface SessionUsage {
  inputTokens: number;
  outputTokens: number;
  sessionCost: number;
}

interface SessionUsageContextValue extends SessionUsage {
  accumulateUsage: (input: number, output: number, model: string) => void;
  resetSessionUsage: () => void;
}

const SessionUsageContext = createContext<SessionUsageContextValue | null>(null);

function computeCost(input: number, output: number, model: string): number {
  if (model === 'policy/zoominfo-general') {
    return (input / 1000) * 0.003 + (output / 1000) * 0.015;
  }
  // default: policy/haiku-general
  return (input / 1000) * 0.0008 + (output / 1000) * 0.004;
}

export function SessionUsageProvider({ children }: { children: ReactNode }) {
  const [usage, setUsage] = useState<SessionUsage>({ inputTokens: 0, outputTokens: 0, sessionCost: 0 });

  const accumulateUsage = useCallback((input: number, output: number, model: string) => {
    const cost = computeCost(input, output, model);
    setUsage((prev) => ({
      inputTokens: prev.inputTokens + input,
      outputTokens: prev.outputTokens + output,
      sessionCost: prev.sessionCost + cost,
    }));
  }, []);

  const resetSessionUsage = useCallback(() => {
    setUsage((prev) => {
      console.log('[SessionUsage] Session summary — inputTokens:', prev.inputTokens, 'outputTokens:', prev.outputTokens, 'sessionCost: $' + prev.sessionCost.toFixed(6));
      return { inputTokens: 0, outputTokens: 0, sessionCost: 0 };
    });
  }, []);

  return (
    <SessionUsageContext.Provider value={{ ...usage, accumulateUsage, resetSessionUsage }}>
      {children}
    </SessionUsageContext.Provider>
  );
}

export function useSessionUsage(): SessionUsageContextValue {
  const ctx = useContext(SessionUsageContext);
  if (!ctx) throw new Error('useSessionUsage must be used inside SessionUsageProvider');
  return ctx;
}
