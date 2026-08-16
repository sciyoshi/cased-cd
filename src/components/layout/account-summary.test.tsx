import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { AccountSummary } from './account-summary'

describe('AccountSummary', () => {
  it('shows the authenticated local principal without fabricated profile data', () => {
    render(
      <AccountSummary
        userInfo={{ loggedIn: true, username: 'admin', iss: 'argocd', groups: [] }}
        userInfoError={null}
      />,
    )

    expect(screen.getByText('admin')).toBeInTheDocument()
    expect(screen.getByText('Local Argo CD account')).toBeInTheDocument()
    expect(screen.queryByText('Admin User')).not.toBeInTheDocument()
    expect(screen.queryByText('admin@cased.cd')).not.toBeInTheDocument()
  })

  it('shows an OIDC principal and its authoritative issuer', () => {
    render(
      <AccountSummary
        userInfo={{
          loggedIn: true,
          username: 'dev@example.com',
          iss: 'https://accounts.google.com',
          groups: ['developers'],
        }}
        userInfoError={null}
      />,
    )

    expect(screen.getByText('dev@example.com')).toBeInTheDocument()
    expect(screen.getByText('https://accounts.google.com')).toBeInTheDocument()
  })

  it('labels identity errors without substituting a fake user', () => {
    render(<AccountSummary userInfo={null} userInfoError="Unavailable" />)

    expect(screen.getByText('Authenticated user')).toBeInTheDocument()
    expect(screen.getByText('Identity unavailable')).toBeInTheDocument()
  })
})
