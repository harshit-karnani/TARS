import type { IContractRegistry, ToolContract, ContractStatus } from './types.ts';

export interface DashboardContractSummary {
  totalContracts: number;
  activeCount: number;
  driftedCount: number;
  blockedCount: number;
  pendingReviewCount: number;
  deprecatedCount: number;
  countsByStatus: Record<ContractStatus, number>;
  contracts: ToolContract[];
  generatedAt: string;
}

export interface DashboardDriftAlert {
  serverId: string;
  toolName: string;
  status: ContractStatus;
  version: string;
  definitionHash: string;
  notes?: string;
  updatedAt: string;
}

/**
 * Aggregates contract registry states into structured metrics for Person 3's Dashboard.
 */
export async function getDashboardContractSummary(
  registry: IContractRegistry
): Promise<DashboardContractSummary> {
  const contracts = await registry.listContracts();
  const countsByStatus: Record<ContractStatus, number> = {
    ACTIVE: 0,
    DRIFTED: 0,
    DEPRECATED: 0,
    BLOCKED: 0,
    PENDING_REVIEW: 0
  };

  for (const c of contracts) {
    if (countsByStatus[c.status] !== undefined) {
      countsByStatus[c.status] += 1;
    }
  }

  return {
    totalContracts: contracts.length,
    activeCount: countsByStatus.ACTIVE,
    driftedCount: countsByStatus.DRIFTED,
    blockedCount: countsByStatus.BLOCKED,
    pendingReviewCount: countsByStatus.PENDING_REVIEW,
    deprecatedCount: countsByStatus.DEPRECATED,
    countsByStatus,
    contracts,
    generatedAt: new Date().toISOString()
  };
}

/**
 * Returns prioritized drift and review alerts for security operators.
 */
export async function getDashboardDriftAlerts(
  registry: IContractRegistry
): Promise<DashboardDriftAlert[]> {
  const all = await registry.listContracts();
  const flagged = all.filter(
    (c) => c.status === 'DRIFTED' || c.status === 'PENDING_REVIEW'
  );

  return flagged.map((c) => ({
    serverId: c.serverId,
    toolName: c.toolName,
    status: c.status,
    version: c.version,
    definitionHash: c.definitionHash,
    notes: c.notes,
    updatedAt: c.updatedAt ?? new Date().toISOString()
  }));
}
