import { render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { SettingsPage } from './settings'

vi.mock('@tanstack/react-router', () => ({ useNavigate: () => vi.fn() }))
vi.mock('@/lib/theme', () => ({
  useAppearance: () => ({ appearance: 'system', setAppearance: vi.fn() }),
}))
vi.mock('@/services/applications', () => ({
  useApplications: () => ({ data: { items: [] } }),
}))
vi.mock('@/services/certificates', () => ({
  useCertificates: () => ({ data: { items: [] } }),
}))
vi.mock('@/services/gpgkeys', () => ({
  useGPGKeys: () => ({ data: { items: [] } }),
}))

describe('SettingsPage', () => {
  it('does not advertise a fabricated or broken Accounts destination', () => {
    render(<SettingsPage />)

    expect(screen.queryByRole('heading', { name: 'Accounts' })).not.toBeInTheDocument()
    expect(screen.queryByText('Manage user accounts and permissions')).not.toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Certificates' })).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'GPG Keys' })).toBeInTheDocument()
  })
})
