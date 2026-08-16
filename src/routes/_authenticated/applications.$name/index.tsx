import { createFileRoute, Navigate } from '@tanstack/react-router'

export const Route = createFileRoute('/_authenticated/applications/$name/')({
  component: RedirectToTree,
})

function RedirectToTree() {
  const search = Route.useSearch()

  return (
    <Navigate
      to="/applications/$name/tree"
      params={(prev) => prev}
      search={search}
    />
  )
}
