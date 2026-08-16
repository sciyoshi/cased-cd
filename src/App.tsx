import { RouterProvider, createRouter } from '@tanstack/react-router'
import { routeTree } from './routeTree.gen'
import { RouteLoading } from '@/components/route-loading'

// Create the router instance
const router = createRouter({
  routeTree,
  defaultPendingComponent: RouteLoading,
  defaultPendingMs: 150,
  defaultPendingMinMs: 200,
})

// Register router for type safety
declare module '@tanstack/react-router' {
  interface Register {
    router: typeof router
  }
}

function App() {
  return <RouterProvider router={router} />
}

export default App
