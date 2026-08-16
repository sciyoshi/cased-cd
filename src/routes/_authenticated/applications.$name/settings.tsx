import { createFileRoute } from '@tanstack/react-router'
import { ApplicationSettingsPage } from '@/pages/application-settings'

export const Route = createFileRoute('/_authenticated/applications/$name/settings')({
  component: ApplicationSettingsRoute,
})

function ApplicationSettingsRoute() {
  const { appNamespace } = Route.useSearch()
  return <ApplicationSettingsPage appNamespace={appNamespace} />
}
