import { describe, it, expect, vi } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import '@testing-library/jest-dom/vitest'
import { MLRiskClassificationPage } from '../components/pages/MLRiskClassificationPage'
import { apiClient } from '../api/client'

describe('ML Risk Classification Dashboard Component', () => {
  it('displays real ML shadow prediction fields from audit events', async () => {
    vi.spyOn(apiClient, 'getEvents').mockResolvedValue({
      data: [
        {
          id: 'evt-test-1',
          requestId: 'req-test-1',
          timestamp: new Date().toISOString(),
          tool: 'read_file',
          action: 'ALLOW',
          reasonCode: 'POLICY_ALLOW',
          executionStatus: 'SUCCESS',
          policyVersion: '1.0.0',
          decisionEvidence: {
            evaluatedChecks: ['policy_rule_matcher'],
            mlShadow: {
              predictedRisk: 'LOW',
              confidence: 0.845,
              classProbabilities: { LOW: 0.845, MEDIUM: 0.07, HIGH: 0.085 },
              model: 'risk_classifier',
              mode: 'shadow',
              success: true,
            },
          },
        },
        {
          id: 'evt-test-2',
          requestId: 'req-test-2',
          timestamp: new Date().toISOString(),
          tool: 'execute_system_command',
          action: 'BLOCK',
          reasonCode: 'POLICY_BLOCK',
          executionStatus: 'BLOCKED',
          policyVersion: '1.0.0',
          decisionEvidence: {
            evaluatedChecks: ['policy_rule_matcher'],
            mlShadow: {
              predictedRisk: 'HIGH',
              confidence: 0.73,
              classProbabilities: { HIGH: 0.73, LOW: 0.095, MEDIUM: 0.175 },
              model: 'risk_classifier',
              mode: 'shadow',
              success: true,
            },
          },
        },
      ],
      isFromMock: false,
    })

    render(<MLRiskClassificationPage />)

    // Wait for the latest tool call to display
    await waitFor(() => {
      expect(screen.getByRole('heading', { name: 'read_file' })).toBeTruthy()
    })

    // Verify risk badge and confidence percentage formatting (0.845 -> 84.5%)
    expect(screen.getAllByText('LOW RISK').length).toBeGreaterThanOrEqual(1)
    expect(screen.getByText('84.5% CONFIDENCE')).toBeTruthy()

    // Verify recent classifications table shows both scored tool calls
    expect(screen.getByText('RECENT CLASSIFICATIONS')).toBeTruthy()
    expect(screen.getByText('execute_system_command')).toBeTruthy()
    expect(screen.getByText('73.0%')).toBeTruthy()
  })

  it('handles missing ML predictions cleanly without fabricating data', async () => {
    vi.spyOn(apiClient, 'getEvents').mockResolvedValue({
      data: [
        {
          id: 'evt-unscored-1',
          requestId: 'req-unscored-1',
          timestamp: new Date().toISOString(),
          tool: 'unscored_tool',
          action: 'ALLOW',
          reasonCode: 'POLICY_ALLOW',
          executionStatus: 'SUCCESS',
          policyVersion: '1.0.0',
          decisionEvidence: {
            evaluatedChecks: ['policy_rule_matcher'],
          },
        },
      ],
      isFromMock: false,
    })

    render(<MLRiskClassificationPage />)

    await waitFor(() => {
      expect(screen.getByText('NO PREDICTIONS AVAILABLE')).toBeTruthy()
      expect(screen.getByText('CONFIDENCE: —')).toBeTruthy()
    })
  })
})
