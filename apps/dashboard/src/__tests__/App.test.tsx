import { describe, it, expect } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import '@testing-library/jest-dom/vitest'
import App from '../App'
import { apiClient } from '../api/client'

describe('TARS Dashboard Canonical Contract & API Alignment', () => {
  it('renders navigation bar with all 4 primary operational views', () => {
    render(<App />)

    expect(screen.getByText('TARS')).toBeInTheDocument()
    expect(screen.getByText('Security Events')).toBeInTheDocument()
    expect(screen.getByText('Tool Contracts & Drift')).toBeInTheDocument()
    expect(screen.getByText('Replay & Regression')).toBeInTheDocument()
    expect(screen.getByText('Decision Evidence')).toBeInTheDocument()
  })

  it('supports REQUIRE_APPROVAL decision with amber badge and filter option in Security Events', () => {
    render(<App />)

    // Verify REQUIRE_APPROVAL option is in the filter select
    const selects = screen.getAllByRole('combobox')
    expect(selects.length).toBeGreaterThanOrEqual(1)
    expect(screen.getByRole('option', { name: 'REQUIRE_APPROVAL' })).toBeInTheDocument()

    // Verify amber badge is rendered for approval-required events
    expect(screen.getAllByText('REQUIRE APPROVAL').length).toBeGreaterThanOrEqual(1)
  })

  it('navigates to Tool Contracts & Drift page and displays canonical contract statuses', () => {
    render(<App />)

    const contractsTabButton = screen.getByRole('button', { name: /Tool Contracts & Drift/i })
    fireEvent.click(contractsTabButton)

    expect(screen.getByText('Tool Contracts & Canonical Drift')).toBeInTheDocument()
    expect(screen.getByText('Registered Tool Contracts')).toBeInTheDocument()
    expect(screen.getByText(/Canonical Definition Hash/i)).toBeInTheDocument()

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

    expect(screen.getByText('Security Replay & Regression Suite')).toBeInTheDocument()
    expect(screen.getByText('Replay Attack Harness')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Run All Replay Tests/i })).toBeInTheDocument()
  })

  it('navigates to Decision Evidence and displays audit breakdown', () => {
    render(<App />)

    const evidenceTabButton = screen.getByRole('button', { name: /Decision Evidence/i })
    fireEvent.click(evidenceTabButton)

    expect(screen.getAllByText('Auditable Decision Evidence').length).toBeGreaterThanOrEqual(1)
    expect(screen.getByText(/Deterministic Policy Evaluation Breakdown/i)).toBeInTheDocument()
    expect(screen.getByText(/Prompt-Injection Risk Signal/i)).toBeInTheDocument()
  })

  it('verifies apiClient methods match agreed endpoints envelope', async () => {
    expect(typeof apiClient.getEvents).toBe('function')
    expect(typeof apiClient.getContracts).toBe('function')
    expect(typeof apiClient.getContractDrift).toBe('function')
    expect(typeof apiClient.getReplayRuns).toBe('function')
    expect(typeof apiClient.runReplaySuite).toBe('function')
    expect(typeof apiClient.subscribeEventStream).toBe('function')

    // Calling without active server returns gracefully enveloped data from fallback
    const res = await apiClient.getEvents()
    expect(res).toHaveProperty('data')
    expect(Array.isArray(res.data)).toBe(true)
    expect(res.isFromMock).toBe(true)
  })
})
