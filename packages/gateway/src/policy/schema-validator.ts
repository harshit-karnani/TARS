import type { ToolInputSchema, SecurityReasonCode } from '@tars/shared-types';

export interface SchemaValidationResult {
  isValid: boolean;
  reasonCode?: SecurityReasonCode;
  errorMessage?: string;
  violations?: string[];
}

/**
 * Deterministic lightweight JSON Schema and parameter bounds validator.
 * Validates required properties, types, and parameter bounds without heavy external dependencies.
 */
export function validateArgumentsAgainstSchema(
  args: Record<string, unknown>,
  schema?: ToolInputSchema
): SchemaValidationResult {
  if (!schema) {
    return { isValid: true };
  }

  const violations: string[] = [];
  let reasonCode: SecurityReasonCode | undefined = undefined;

  // 1. Check required properties
  const required = Array.isArray(schema.required) ? (schema.required as string[]) : [];
  for (const reqKey of required) {
    if (args[reqKey] === undefined || args[reqKey] === null) {
      violations.push(`Missing required parameter: '${reqKey}'`);
      reasonCode = 'SCHEMA_MISMATCH';
    }
  }

  // 2. Check property types and bounds
  const properties = (schema.properties as Record<string, Record<string, unknown>>) || {};
  for (const [key, value] of Object.entries(args)) {
    const propSchema = properties[key];
    if (!propSchema) {
      // Unknown parameter in strict mode if additionalProperties === false
      if (schema.additionalProperties === false) {
        violations.push(`Unexpected parameter '${key}' not allowed in strict schema`);
        reasonCode = reasonCode || 'SCHEMA_MISMATCH';
      }
      continue;
    }

    if (value === undefined || value === null) {
      continue;
    }

    const expectedType = propSchema.type as string | undefined;

    // Type checks
    if (expectedType) {
      const actualType = typeof value;
      let typeMatches = true;

      if (expectedType === 'string' && actualType !== 'string') typeMatches = false;
      if (expectedType === 'number' && actualType !== 'number') typeMatches = false;
      if (expectedType === 'boolean' && actualType !== 'boolean') typeMatches = false;
      if (expectedType === 'array' && !Array.isArray(value)) typeMatches = false;
      if (expectedType === 'object' && (actualType !== 'object' || Array.isArray(value))) typeMatches = false;

      if (!typeMatches) {
        violations.push(`Parameter '${key}' expected type '${expectedType}', got '${actualType}'`);
        reasonCode = reasonCode || 'SCHEMA_MISMATCH';
      }
    }

    // Parameter Bounds Checks
    if (typeof value === 'number') {
      if (typeof propSchema.minimum === 'number' && value < propSchema.minimum) {
        violations.push(`Parameter '${key}' value ${value} is less than minimum ${propSchema.minimum}`);
        reasonCode = 'PARAMETER_OUT_OF_BOUNDS';
      }
      if (typeof propSchema.maximum === 'number' && value > propSchema.maximum) {
        violations.push(`Parameter '${key}' value ${value} is greater than maximum ${propSchema.maximum}`);
        reasonCode = 'PARAMETER_OUT_OF_BOUNDS';
      }
    }

    if (typeof value === 'string') {
      if (typeof propSchema.minLength === 'number' && value.length < propSchema.minLength) {
        violations.push(`Parameter '${key}' length ${value.length} is less than minLength ${propSchema.minLength}`);
        reasonCode = 'PARAMETER_OUT_OF_BOUNDS';
      }
      if (typeof propSchema.maxLength === 'number' && value.length > propSchema.maxLength) {
        violations.push(`Parameter '${key}' length ${value.length} exceeds maxLength ${propSchema.maxLength}`);
        reasonCode = 'PARAMETER_OUT_OF_BOUNDS';
      }
    }
  }

  if (violations.length > 0) {
    return {
      isValid: false,
      reasonCode: reasonCode || 'SCHEMA_MISMATCH',
      errorMessage: violations.join('; '),
      violations,
    };
  }

  return { isValid: true };
}
