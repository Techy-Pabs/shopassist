import { screen, within } from '@testing-library/react'

// The chat launcher, in its corner region. The page has a second "Ask Loom &
// Lane" button (in its help section), so tests find the launcher by region.
export const launcherButton = () =>
  within(screen.getByRole('complementary', { name: 'Chat' })).getByRole('button', { name: 'Ask Loom & Lane' })
