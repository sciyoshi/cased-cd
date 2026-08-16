import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { RouteLoading } from './route-loading'

describe('RouteLoading', () => {
  it('announces lazy route transitions accessibly', () => {
    render(<RouteLoading />)

    expect(screen.getByRole('status')).toHaveTextContent('Loading page…')
  })
})
