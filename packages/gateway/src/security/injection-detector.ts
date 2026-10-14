/**
 * Prompt injection heuristic risk detector.
 *
 * NOTE (Rule 5): Prompt-injection detection is a limited risk signal,
 * NOT a guarantee of prevention. Used to calculate risk scores and
 * flag evidence in audit logs.
 */

export interface InjectionRiskSignal {
  hasRisk: boolean;
  riskScore: number; // 0 to 100
  matchedPatterns: string[];
}

const INJECTION_PATTERNS: Array<{ pattern: RegExp; weight: number; label: string }> = [
  { pattern: /ignore\s+(all\s+)?(previous|prior)\s+(instructions|prompts|commands)/i, weight: 60, label: 'ignore_instructions_override' },
  { pattern: /disregard\s+(the\s+)?(system|above|developer)\s+(prompt|instructions)/i, weight: 60, label: 'disregard_system_prompt' },
  { pattern: /you\s+are\s+now\s+(in\s+developer\s+mode|DAN|unrestricted|an\s+unfiltered)/i, weight: 70, label: 'persona_jailbreak' },
  { pattern: /system\s*:\s*override/i, weight: 50, label: 'system_override_header' },
  { pattern: /<\s*(?:system|system_prompt|instructions)\s*>/i, weight: 45, label: 'xml_system_tag_injection' },
  { pattern: /bypass\s+(security|safety|filter|guardrail)/i, weight: 50, label: 'explicit_bypass_request' },
  { pattern: /print\s+(your\s+)?(initial\s+|system\s+)?prompt/i, weight: 35, label: 'prompt_leak_attempt' },
  { pattern: /base64\s+decode.*exec/i, weight: 55, label: 'encoded_execution_payload' },
];

/**
 * Evaluates an input string for prompt injection risk signals.
 */
export function evaluateTextForInjection(text: string): InjectionRiskSignal {
  if (!text || typeof text !== 'string') {
    return { hasRisk: false, riskScore: 0, matchedPatterns: [] };
  }

  let totalScore = 0;
  const matchedPatterns: string[] = [];

  for (const { pattern, weight, label } of INJECTION_PATTERNS) {
    if (pattern.test(text)) {
      matchedPatterns.push(label);
      totalScore += weight;
    }
  }

  const normalizedScore = Math.min(100, totalScore);

  return {
    hasRisk: normalizedScore >= 50,
    riskScore: normalizedScore,
    matchedPatterns,
  };
}

/**
 * Recursively inspects all string fields in an arguments object for injection signals.
 */
export function inspectArgumentsForInjection(args: Record<string, unknown>): InjectionRiskSignal {
  let highestScore = 0;
  const allMatched: string[] = [];

  function traverse(value: unknown): void {
    if (typeof value === 'string') {
      const res = evaluateTextForInjection(value);
      if (res.riskScore > highestScore) {
        highestScore = res.riskScore;
      }
      allMatched.push(...res.matchedPatterns);
    } else if (Array.isArray(value)) {
      value.forEach(traverse);
    } else if (typeof value === 'object' && value !== null) {
      Object.values(value).forEach(traverse);
    }
  }

  traverse(args);

  return {
    hasRisk: highestScore >= 50,
    riskScore: Math.min(100, highestScore),
    matchedPatterns: [...new Set(allMatched)],
  };
}
