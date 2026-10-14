import { describe, it, expect } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import '@testing-library/jest-dom/vitest'
import App from '../App'
import { apiClient } from '../api/client'

describe('TARS Dashboard Canonical Contract & API Alignment', () => {
  it('renders navigation bar with all 4 primary operational views', () => {
    render(<App />)

    expect(screen.getByText('TARS')).toBeTruthy()
    expect(screen.getByText('Security Events')).toBeTruthy()
    expect(screen.getByText('Tool Contracts & Drift')).toBeTruthy()
    expect(screen.getByText('Replay & Regression')).toBeTruthy()
    expect(screen.getByText('Decision Evidence')).toBeTruthy()
  })

  it('supports REQUIRE_APPROVAL decision with amber badge and filter option in Security Events', () => {
    render(<App />)

    // Verify REQUIRE_APPROVAL option is in the filter select
    const selects = screen.getAllByRole('combobox')
    expect(selects.length).toBeGreaterThanOrEqual(1)
    expect(screen.getByRole('option', { name: 'REQUIRE_APPROVAL' })).toBeTruthy()

    // Verify amber badge is rendered for approval-required events
    expect(screen.getAllByText('REQUIRE APPROVAL').length).toBeGreaterThanOrEqual(1)
  })

  it('navigates to Tool Contracts & Drift page and displays canonical contract statuses', async () => {
    render(<App />)

    const contractsTabButton = screen.getByRole('button', { name: /Tool Contracts & Drift/i })
    fireEvent.click(contractsTabButton)

    expect(screen.getByText(/Tool Contracts & Canonical Drift/i)).toBeTruthy()
    expect(screen.getByText('Registered Tool Contracts')).toBeTruthy()
    expect(await screen.findByText(/Canonical Definition Hash/i)).toBeTruthy()

    // Verify canonical ContractStatus indicators: ACTIVE, DRIFTED, BLOCKED, PENDING_REVIEW, DEPRECATED
    expect(screen.getAllByText('ACTIVE').length).toBeGreaterThanOrEqual(1)
    expect(screen.getAllByText('DRIFTED').length).toBeGreaterThanOrEqual(1)
    expect(screen.getAllByText('BLOCKED').length).toBeGreaterThanOrEqual(1)
    expect(screen.getAllByText('PENDING_REVIEW').length).toBeGreaterThanOrEqual(1)
    expect(screen.getAllByText('DEPRECATED').length).toBeGreaterThanOrEqual(1)
  })

  it('navigates to Replay & Regression page and displays test harness', () => {
    render(<App />)

    const replayTabButton = screen.getByRole('button', { name: /Replay & Regression/i })
    fireEvent.click(replayTabButton)

    expect(screen.getByText(/Security Replay & Regression Suite/i)).toBeTruthy()
    expect(screen.getByText('Replay Attack Harness')).toBeTruthy()
    expect(screen.getAllByRole('button', { name: /Run All Replay Tests/i }).length).toBeGreaterThanOrEqual(1)
  })

  it('navigates to Decision Evidence and displays audit breakdown', async () => {
    render(<App />)

    const evidenceTabButton = screen.getByRole('button', { name: /Decision Evidence/i })
    fireEvent.click(evidenceTabButton)

    expect(screen.getAllByText(/Auditable Decision Evidence/i).length).toBeGreaterThanOrEqual(1)
    // Supports either live populated event or honest empty state without crashing
    const detailOrEmpty = await screen.findByText(
      /Deterministic Policy Evaluation Breakdown|No Security Audit Records Found/i
    )
    expect(detailOrEmpty).toBeTruthy()
  })

  it('verifies apiClient methods match agreed endpoints envelope and never return fake mock data', async () => {
    expect(typeof apiClient.getEvents).toBe('function')
    expect(typeof apiClient.getContracts).toBe('function')
    expect(typeof apiClient.getContractDrift).toBe('function')
    expect(typeof apiClient.getReplayRuns).toBe('function')
    expect(typeof apiClient.runReplaySuite).toBe('function')
    expect(typeof apiClient.subscribeEventStream).toBe('function')

    // Calling returns genuinely enveloped data without silent mock fallback
    const res = await apiClient.getEvents()
    expect(res).toHaveProperty('data')
    expect(Array.isArray(res.data)).toBe(true)
    expect(res.isFromMock).toBe(false)

    // Contract drift check does not fabricate fake sync
    const driftRes = await apiClient.getContractDrift('nonexistent-server', 'nonexistent-tool')
    expect(driftRes.isFromMock).toBe(false)
  })
})

