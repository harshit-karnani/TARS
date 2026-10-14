/**
 * ContractStatus indicates the current lifecycle or integrity state of a ToolContract.
 */
export type ContractStatus =
  | 'ACTIVE'
  | 'DRIFTED'
  | 'DEPRECATED'
  | 'BLOCKED'
  | 'PENDING_REVIEW';

export const CONTRACT_STATUSES: readonly ContractStatus[] = [
  'ACTIVE',
  'DRIFTED',
  'DEPRECATED',
  'BLOCKED',
  'PENDING_REVIEW',
] as const;

export function isContractStatus(value: unknown): value is ContractStatus {
  return typeof value === 'string' && (CONTRACT_STATUSES as readonly string[]).includes(value);
}

/**
 * ToolContract represents the immutable or registered contract specification
 * of an MCP tool, including its canonical definition hash and status.
 */
export interface ToolContract {
  /** Identifier of the MCP upstream server hosting the tool */
  serverId: string;

  /** Name of the MCP tool */
  toolName: string;

  /** Human-readable description of what the tool does */
  description?: string;

  /** JSON Schema of the expected input parameters */
  inputSchema: Record<string, unknown>;

  /** Canonical hash (e.g. SHA-256 of normalized schema/tool definition) */
  definitionHash: string;

  /** Semantic or sequential contract version (e.g. "1.0.0") */
  version: string;

  /** Contract lifecycle status */
  status: ContractStatus;

  /** Optional contract metadata */
  createdAt?: string;
  updatedAt?: string;
  notes?: string;
}

/**
 * Granular schema difference detected during contract drift comparison.
 */
export interface SchemaDifference {
  path: string;
  changeType: 'ADDED' | 'REMOVED' | 'MODIFIED';
  expected?: unknown;
  actual?: unknown;
  description?: string;
}

/**
 * ContractDriftResult captures the outcome of verifying an advertised tool definition
 * against its registered contract in the contract registry.
 */
export interface ContractDriftResult {
  serverId: string;
  toolName: string;
  contractVersion: string;
  hasDrift: boolean;
  expectedHash: string;
  actualHash: string;
  detectedAt: string;
  schemaDifferences?: SchemaDifference[];
}

/**
 * Backward-compatibility alias for ContractDriftResult.
 */
export type ContractDriftDetails = ContractDriftResult;

/**
 * Filter options for querying contracts from the registry.
 */
export interface ContractQueryFilter {
  serverId?: string;
  status?: ContractStatus;
}

/**
 * IContractRegistry defines the contract management interface coordinated with Person 2
 * for contract storage, retrieval, hashing, and drift verification.
 */
export interface IContractRegistry {
  /** Retrieve a contract by server and tool name */
  getContract(serverId: string, toolName: string): Promise<ToolContract | null>;

  /** List contracts with optional filters */
  listContracts(filter?: ContractQueryFilter): Promise<ToolContract[]>;

  /** Register or update a tool contract */
  registerContract(contract: Omit<ToolContract, 'createdAt' | 'updatedAt'>): Promise<ToolContract>;

  /** Update contract lifecycle status (e.g. ACTIVE -> DRIFTED or BLOCKED) */
  updateContractStatus(serverId: string, toolName: string, status: ContractStatus): Promise<ToolContract>;

  /** Check runtime tool definition against the registered contract */
  checkDrift(
    serverId: string,
    toolName: string,
    advertisedDefinition: {
      description?: string;
      inputSchema: Record<string, unknown>;
    }
  ): Promise<ContractDriftResult>;

  /** Calculate canonical SHA-256 hash of a normalized tool definition */
  computeDefinitionHash(definition: {
    toolName: string;
    description?: string;
    inputSchema: Record<string, unknown>;
  }): string;
}
