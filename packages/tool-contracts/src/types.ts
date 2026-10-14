/**
 * TARS Tool Contracts - Package Types
 * Re-exports canonical contract types defined in @tars/shared-types
 * Owned by: Person 2 (Tool Contract Firewall & Regression Engine)
 */

export type {
  ContractStatus,
  ToolContract,
  SchemaDifference,
  ContractDriftResult,
  ContractDriftDetails,
  ContractQueryFilter,
  IContractRegistry
} from '../../shared-types/src/contract.ts';

export {
  CONTRACT_STATUSES,
  isContractStatus
} from '../../shared-types/src/contract.ts';

/**
 * Advertised tool definition submitted by an upstream MCP server or client
 */
export interface ToolDefinition {
  toolName: string;
  description?: string;
  inputSchema: Record<string, unknown>;
  serverId?: string;
}
