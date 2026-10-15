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

export interface ContentInspectionResult {
  hasInjection: boolean;
  confidence: 'HIGH' | 'MEDIUM' | 'LOW' | 'NONE';
  riskScore: number;
  matchedPatterns: string[];
  action: 'ALLOW' | 'BLOCK' | 'FLAG_FOR_REVIEW';
  reason: string;
}

const BENIGN_DISCUSSION_PATTERNS: RegExp[] = [
  /security\s+test\s+cases?/i,
  /test\s+data/i,
  /for\s+testing/i,
  /prompt\s+injection\s+(?:attacks?|benchmarks?|evaluations?|papers?|defenses?|risks?|research|examples?)/i,
  /testing\s+a\s+separate\s+content[- ]scanning/i,
  /how\s+prompt\s+injection\s+works/i,
  /discussion\s+of\s+prompt\s+injection/i,
  /preventing\s+prompt\s+injection/i,
];

// Contextual active injection patterns: imperative malicious instructions targeting the AI assistant
const ACTIVE_MALICIOUS_INSTRUCTION_PATTERNS: Array<{ pattern: RegExp; weight: number; label: string }> = [
  { pattern: /(?:^|[\r\n\.\?!;])\s*(?:please\s+)?ignore\s+(?:all\s+)?(?:previous|prior|above)\s+(?:instructions|prompts|commands|rules)/i, weight: 80, label: 'ignore_instructions_override' },
  { pattern: /(?:^|[\r\n\.\?!;])\s*(?:please\s+)?disregard\s+(?:all\s+)?(?:the\s+)?(?:system|above|developer)\s+(?:prompt|instructions|rules)/i, weight: 80, label: 'disregard_system_prompt' },
  { pattern: /(?:^|[\r\n\.\?!;])\s*you\s+are\s+now\s+(?:in\s+developer\s+mode|DAN|unrestricted|an\s+unfiltered|an\s+adversarial)/i, weight: 75, label: 'persona_jailbreak' },
  { pattern: /(?:^|[\r\n])(?:system|developer|admin)\s*:\s*(?:override|new\s+instructions)/i, weight: 70, label: 'system_override_header' },
  { pattern: /<\s*(?:system|system_prompt|instructions|admin_command)\s*>/i, weight: 65, label: 'xml_system_tag_injection' },
  { pattern: /(?:^|[\r\n\.\?!;])\s*(?:bypass|disable|turn\s+off)\s+(?:all\s+)?(?:security|safety|filter|guardrails?|policies)/i, weight: 70, label: 'explicit_bypass_request' },
  { pattern: /(?:^|[\r\n\.\?!;])\s*(?:print|reveal|output|display|show|leak)\s+(?:all\s+)?(?:your\s+)?(?:initial\s+|system\s+|secret\s+)?(?:prompt|instructions|system\s+prompt|api\s*keys?|secrets?)/i, weight: 65, label: 'prompt_or_secret_leak_attempt' },
  { pattern: /(?:^|[\r\n\.\?!;])\s*(?:execute|run)\s+(?:unauthorized|arbitrary|system|shell)\s+(?:command|actions?|code)/i, weight: 65, label: 'unauthorized_execution_instruction' },
  { pattern: /base64\s+decode.*exec/i, weight: 60, label: 'encoded_execution_payload' },
];

/**
 * Checks if the text appears to be harmless educational/research/test discussion
 * rather than an active payload directed at the agent.
 */
export function isBenignDiscussion(text: string): boolean {
  for (const pattern of BENIGN_DISCUSSION_PATTERNS) {
    if (pattern.test(text)) {
      return true;
    }
  }
  return false;
}

/**
 * Evaluates an input string for prompt injection risk signals.
 */
export function evaluateTextForInjection(text: string): InjectionRiskSignal {
  if (!text || typeof text !== 'string') {
    return { hasRisk: false, riskScore: 0, matchedPatterns: [] };
  }

  let totalScore = 0;
  const matchedPatterns: string[] = [];

  for (const { pattern, weight, label } of ACTIVE_MALICIOUS_INSTRUCTION_PATTERNS) {
    const rx = new RegExp(pattern.source, pattern.flags);
    if (rx.test(text)) {
      matchedPatterns.push(label);
      totalScore += weight;
    }
  }

  // If text is educational/discussion, reduce score so harmless text is not treated as high-confidence attack
  if (isBenignDiscussion(text)) {
    totalScore = Math.floor(totalScore * 0.3);
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

/**
 * Inspects retrieved text / file content for suspicious instructions:
 * - High confidence malicious instruction -> BLOCK
 * - Ambiguous / moderate risk -> FLAG_FOR_REVIEW
 * - Harmless / educational / ordinary content -> ALLOW
 */
export function inspectContentForInjection(content: string): ContentInspectionResult {
  if (!content || typeof content !== 'string') {
    return {
      hasInjection: false,
      confidence: 'NONE',
      riskScore: 0,
      matchedPatterns: [],
      action: 'ALLOW',
      reason: 'No content to inspect',
    };
  }

  const isBenign = isBenignDiscussion(content);
  const matched: string[] = [];
  let score = 0;

  for (const { pattern, weight, label } of ACTIVE_MALICIOUS_INSTRUCTION_PATTERNS) {
    const rx = new RegExp(pattern.source, pattern.flags);
    if (rx.test(content)) {
      matched.push(label);
      score += weight;
    }
  }

  if (isBenign) {
    // If it mentions test cases, research, or prompt injection as a concept:
    // It should not be blocked solely because it contains suspicious phrases.
    if (matched.length > 0) {
      return {
        hasInjection: false,
        confidence: 'LOW',
        riskScore: Math.min(30, Math.floor(score * 0.2)),
        matchedPatterns: matched,
        action: 'ALLOW',
        reason: 'Benign documentation/test text discussing security concepts or test cases',
      };
    }
    return {
      hasInjection: false,
      confidence: 'NONE',
      riskScore: 0,
      matchedPatterns: [],
      action: 'ALLOW',
      reason: 'Safe content',
    };
  }

  const normalizedScore = Math.min(100, score);

  if (normalizedScore >= 65) {
    return {
      hasInjection: true,
      confidence: 'HIGH',
      riskScore: normalizedScore,
      matchedPatterns: matched,
      action: 'BLOCK',
      reason: `Detected high-confidence malicious instruction in retrieved content (${matched.join(', ')})`,
    };
  }

  if (normalizedScore >= 40) {
    return {
      hasInjection: true,
      confidence: 'MEDIUM',
      riskScore: normalizedScore,
      matchedPatterns: matched,
      action: 'FLAG_FOR_REVIEW',
      reason: `Ambiguous instruction patterns detected in retrieved content (${matched.join(', ')}); flagged for review`,
    };
  }

  return {
    hasInjection: false,
    confidence: 'NONE',
    riskScore: normalizedScore,
    matchedPatterns: matched,
    action: 'ALLOW',
    reason: 'Ordinary content without malicious instructions',
  };
}
