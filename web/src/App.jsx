import Launcher from './components/Launcher.jsx'
import Storefront from './components/Storefront.jsx'

export default function App() {
  return (
    <div className="relative min-h-screen bg-surface-100 text-ink">
      <Storefront />
      <Launcher />
    </div>
  )
}
