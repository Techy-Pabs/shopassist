import { lazy, Suspense } from 'react'
import { BrowserRouter, Route, Routes } from 'react-router'

import App from './App.jsx'

// The admin dashboard is its own bundle, downloaded only at /admin
const AdminApp = lazy(() => import('./admin/AdminApp.jsx'))

// "/" is the store's chat site, exactly as before; "/admin/..." is the dashboard
export function AppRoutes({ fetchImpl }) {
  return (
    <Routes>
      <Route
        path="/admin/*"
        element={
          <Suspense fallback={null}>
            <AdminApp fetchImpl={fetchImpl} />
          </Suspense>
        }
      />
      <Route path="*" element={<App fetchImpl={fetchImpl} />} />
    </Routes>
  )
}

export default function Root() {
  return (
    <BrowserRouter>
      <AppRoutes />
    </BrowserRouter>
  )
}
