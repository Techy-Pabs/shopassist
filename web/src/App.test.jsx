import { render, screen, within } from '@testing-library/react'

import App from './App.jsx'

describe('storefront with the closed launcher', () => {
  it('shows the header, hero and products', () => {
    render(<App />)

    expect(screen.getByRole('link', { name: 'Loom & Lane' })).toBeInTheDocument()
    const nav = screen.getByRole('navigation', { name: 'Main' })
    expect(within(nav).getAllByRole('link').map((a) => a.textContent)).toEqual([
      'New in', 'Women', 'Men', 'Accessories', 'Pickup in Lekki',
    ])
    expect(screen.getByRole('heading', { level: 1, name: 'Linen for long Lagos afternoons' })).toBeInTheDocument()
    expect(screen.getByRole('img', { name: 'Product photograph placeholder' })).toBeInTheDocument()
    expect(screen.getByRole('heading', { level: 2, name: 'Just arrived' })).toBeInTheDocument()
    for (const name of ['Adire wrap dress', 'Linen camp shirt', 'Woven tote']) {
      expect(screen.getByText(name)).toBeInTheDocument()
    }
    expect(screen.getAllByText('[PRICE]')).toHaveLength(3)
  })

  it('shows the launcher and its invitation', () => {
    render(<App />)

    const launcher = screen.getByRole('button', { name: 'Ask Loom & Lane' })
    expect(launcher).toHaveAttribute('aria-haspopup', 'dialog')
    expect(launcher).toHaveAttribute('aria-expanded', 'false')
    expect(screen.getByText('Questions about delivery or sizing? Ask us here.')).toBeInTheDocument()
  })

  it('keeps the monogram away from screen readers', () => {
    render(<App />)

    expect(screen.getByText('L&L')).toHaveAttribute('aria-hidden', 'true')
  })
})
