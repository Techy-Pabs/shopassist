import { Route, Routes } from 'react-router'

import AdminLayout from './AdminLayout.jsx'
import { Checking, NotAllowed, SignIn, Unreachable } from './Gates.jsx'
import { useAdminLook } from './look.js'
import ConversationsPage from './pages/ConversationsPage.jsx'
import OverviewPage from './pages/OverviewPage.jsx'
import { CustomersPage, KnowledgePage, NotFoundPage } from './pages/Pages.jsx'
import { AdminSessionProvider, useAdminSession } from './session.jsx'

// The admin dashboard, at /admin. Loaded only when an admin address is
// opened, so the store's visitors never download it.
function Gate() {
  const { status } = useAdminSession()
  if (status === 'signed-out') return <SignIn />
  if (status === 'checking') return <Checking />
  if (status === 'unreachable') return <Unreachable />
  if (status === 'not-admin') return <NotAllowed />
  return (
    <AdminLayout>
      <Routes>
        <Route index element={<OverviewPage />} />
        {/* One route, so opening a conversation keeps the list as it is */}
        <Route path="conversations/:conversationId?" element={<ConversationsPage />} />
        <Route path="knowledge" element={<KnowledgePage />} />
        <Route path="customers" element={<CustomersPage />} />
        <Route path="*" element={<NotFoundPage />} />
      </Routes>
    </AdminLayout>
  )
}

export default function AdminApp({ fetchImpl }) {
  useAdminLook()
  return (
    <AdminSessionProvider fetchImpl={fetchImpl}>
      <div className="sa-root min-h-dvh bg-sa-ground font-sa-sans text-sa-body text-sa-ink">
        <Gate />
      </div>
    </AdminSessionProvider>
  )
}
