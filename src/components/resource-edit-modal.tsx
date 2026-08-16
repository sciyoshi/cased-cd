import { useState, useEffect, useRef } from 'react'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { IconCircleWarning, IconEdit } from 'obra-icons-react'
import {
  getEditableFields,
  getNestedValue,
  setNestedValue,
  canEditResource,
  buildValidatedResourceMergePatch,
  type FieldDefinition,
} from '@/lib/k8s-field-rules'
import { usePatchResource } from '@/services/applications'
import type { Application } from '@/types/api'
import * as YAML from 'js-yaml'

interface ResourceEditModalProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  resource: {
    kind: string
    name: string
    namespace?: string
    manifest: Record<string, unknown>
  }
  app: Application
  appName: string
  appNamespace?: string
}

type EditMode = 'quick' | 'yaml'

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}

function getErrorMessage(error: unknown): string {
  if (error instanceof Error) return error.message
  return 'Argo CD rejected the resource patch.'
}

export function ResourceEditModal({
  open,
  onOpenChange,
  resource,
  app,
  appName,
  appNamespace,
}: ResourceEditModalProps) {
  const [mode, setMode] = useState<EditMode>('quick')
  const [editedValues, setEditedValues] = useState<Record<string, unknown>>({})
  const [yamlContent, setYamlContent] = useState('')
  const [showConfirm, setShowConfirm] = useState(false)
  const [validationErrors, setValidationErrors] = useState<string[]>([])
  const wasOpen = useRef(false)
  const patchMutation = usePatchResource()

  // Check if editing is allowed
  const editCheck = canEditResource(app)

  // Get common editable fields for this resource kind, filtered to only those that exist in manifest
  const allEditableFields = getEditableFields(resource.kind)
  const editableFields = Object.fromEntries(
    Object.entries(allEditableFields).filter(([, fieldDef]) => {
      const value = getNestedValue(resource.manifest, fieldDef.path)
      return value !== undefined
    })
  )
  const hasQuickEditFields = Object.keys(editableFields).length > 0

  const resetConfirmation = () => {
    setShowConfirm(false)
    setValidationErrors([])
  }

  // Every closed-to-open transition starts from the latest fetched manifest and
  // requires a new confirmation. Query refreshes may replace the manifest object
  // while this dialog is open; those must not erase an in-progress confirmation.
  useEffect(() => {
    if (open && !wasOpen.current) {
      setYamlContent(YAML.dump(resource.manifest, { indent: 2, lineWidth: -1 }))
      setEditedValues({})
      setShowConfirm(false)
      setValidationErrors([])
    }
    wasOpen.current = open
  }, [open, resource.manifest])

  const prepareQuickPatch = (): Record<string, unknown> | null => {
    const errors: string[] = []
    const editedManifest = structuredClone(resource.manifest)

    Object.entries(editedValues).forEach(([fieldName, value]) => {
      const fieldDef = editableFields[fieldName]
      if (!fieldDef || value === undefined) return

      if (fieldDef.type === 'number' && typeof value === 'number') {
        if (fieldDef.min !== undefined && value < fieldDef.min) {
          errors.push(`${fieldDef.label} must be at least ${fieldDef.min}.`)
        }
        if (fieldDef.max !== undefined && value > fieldDef.max) {
          errors.push(`${fieldDef.label} must be at most ${fieldDef.max}.`)
        }
      }

      setNestedValue(editedManifest, fieldDef.path, value)
    })

    if (errors.length > 0) {
      setValidationErrors(errors)
      return null
    }

    const result = buildValidatedResourceMergePatch(resource.kind, resource.manifest, editedManifest)
    if (result.errors.length > 0) {
      setValidationErrors(result.errors)
      return null
    }
    if (result.changedPaths.length === 0) {
      setValidationErrors(['Make at least one change before applying.'])
      return null
    }

    return result.patch
  }

  const prepareYamlPatch = (): Record<string, unknown> | null => {
    try {
      const parsedManifest = YAML.load(yamlContent, { schema: YAML.JSON_SCHEMA })
      if (!isRecord(parsedManifest)) {
        setValidationErrors(['YAML must define a single Kubernetes resource object.'])
        return null
      }

      const result = buildValidatedResourceMergePatch(
        resource.kind,
        resource.manifest,
        parsedManifest,
      )
      if (result.errors.length > 0) {
        setValidationErrors(result.errors)
        return null
      }
      if (result.changedPaths.length === 0) {
        setValidationErrors(['Make at least one change before applying.'])
        return null
      }

      return result.patch
    } catch (error) {
      const message = error instanceof YAML.YAMLException ? error.message : getErrorMessage(error)
      setValidationErrors([`Invalid YAML: ${message}`])
      return null
    }
  }

  const handleApplyClick = async () => {
    setValidationErrors([])
    const patch = mode === 'quick' ? prepareQuickPatch() : prepareYamlPatch()
    if (!patch) {
      setShowConfirm(false)
      return
    }

    if (!showConfirm) {
      setShowConfirm(true)
      return
    }

    try {
      const apiVersion = (resource.manifest.apiVersion as string) || 'v1'
      const [group, version] = apiVersion.includes('/') ? apiVersion.split('/') : ['', apiVersion]

      await patchMutation.mutateAsync({
        appName,
        appNamespace: app.metadata.namespace || appNamespace,
        resourceName: resource.name,
        kind: resource.kind,
        namespace: resource.namespace,
        group,
        version,
        patch,
        patchType: 'application/merge-patch+json',
      })

      resetConfirmation()
      onOpenChange(false)
    } catch (error) {
      setShowConfirm(false)
      setValidationErrors([`Failed to apply changes: ${getErrorMessage(error)}`])
    }
  }

  const handleOpenChange = (nextOpen: boolean) => {
    if (!nextOpen) resetConfirmation()
    onOpenChange(nextOpen)
  }

  const handleModeChange = (nextMode: string) => {
    setMode(nextMode as EditMode)
    resetConfirmation()
  }

  const handleContentChange = () => {
    resetConfirmation()
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="max-w-2xl max-h-[80vh] flex flex-col p-0">
        {/* Header - Fixed */}
        <div className="p-6 pb-4 border-b">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <IconEdit size={20} />
              Edit {resource.kind}: {resource.name}
            </DialogTitle>
            <DialogDescription>
              {resource.namespace && `Namespace: ${resource.namespace}`}
            </DialogDescription>
          </DialogHeader>

          {/* Auto-sync warning */}
          {!editCheck.allowed && (
            <Alert variant="destructive" className="mt-4">
              <IconCircleWarning size={16} />
              <AlertDescription className="ml-2">{editCheck.reason}</AlertDescription>
            </Alert>
          )}

          {/* General warning */}
          {editCheck.warning && (
            <Alert className="mt-4">
              <IconCircleWarning size={16} />
              <AlertDescription className="ml-2">{editCheck.warning}</AlertDescription>
            </Alert>
          )}
        </div>

        {/* Scrollable Content Area */}
        <div className="flex-1 overflow-y-auto px-6 py-4">
          <Tabs value={mode} onValueChange={handleModeChange}>
            <TabsList className="grid w-full grid-cols-2">
              <TabsTrigger value="quick" disabled={!hasQuickEditFields}>
                Quick Edit
              </TabsTrigger>
              <TabsTrigger value="yaml">YAML Mode</TabsTrigger>
            </TabsList>

            {/* Quick Edit Mode */}
            <TabsContent value="quick" className="space-y-4 mt-4">
              {!hasQuickEditFields ? (
                <Alert>
                  <AlertDescription>
                    Quick edit is not available for {resource.kind} resources. Use YAML mode instead.
                  </AlertDescription>
                </Alert>
              ) : (
                <>
                  {Object.entries(editableFields).map(([fieldName, fieldDef]) => (
                    <FieldEditor
                      key={fieldName}
                      fieldName={fieldName}
                      fieldDef={fieldDef}
                      manifest={resource.manifest}
                      value={editedValues[fieldName]}
                      onChange={(value) => {
                        handleContentChange()
                        setEditedValues((prev) => ({
                          ...prev,
                          [fieldName]: value,
                        }))
                      }}
                    />
                  ))}
                </>
              )}
            </TabsContent>

            {/* YAML Mode */}
            <TabsContent value="yaml" className="mt-4">
              <div className="space-y-2">
                <Label htmlFor="resource-manifest-yaml">Resource Manifest (YAML)</Label>
                <textarea
                  id="resource-manifest-yaml"
                  className="w-full h-96 font-mono text-sm p-4 bg-muted rounded-lg border border-border focus:outline-none focus:ring-2 focus:ring-ring"
                  value={yamlContent}
                  onChange={(e) => {
                    handleContentChange()
                    setYamlContent(e.target.value)
                  }}
                  spellCheck={false}
                />
              </div>
            </TabsContent>
          </Tabs>
        </div>

        {/* Actions - Sticky Footer */}
        <div className="p-6 pt-4 border-t bg-card space-y-4">
          {validationErrors.length > 0 && (
            <Alert variant="destructive">
              <IconCircleWarning size={16} />
              <AlertDescription className="ml-2">
                <strong>Changes not applied</strong>
                <ul className="mt-1 list-disc space-y-1 pl-5">
                  {validationErrors.map((error) => <li key={error}>{error}</li>)}
                </ul>
              </AlertDescription>
            </Alert>
          )}

          {/* Inline Confirmation Warning */}
          {showConfirm && (
            <Alert variant="destructive">
              <IconCircleWarning size={16} />
              <AlertDescription className="ml-2">
                <strong>Confirm:</strong> This will modify <strong>{resource.kind}/{resource.name}</strong> directly
                in the live cluster, bypassing GitOps. The application will show as OutOfSync until you sync from Git.
              </AlertDescription>
            </Alert>
          )}

          <div className="flex justify-end gap-2">
            <Button
              variant="outline"
              onClick={() => {
                if (showConfirm) {
                  resetConfirmation()
                } else {
                  handleOpenChange(false)
                }
              }}
            >
              Cancel
            </Button>
            <Button
              onClick={handleApplyClick}
              disabled={!editCheck.allowed || patchMutation.isPending}
              variant={showConfirm ? 'destructive' : 'default'}
            >
              {patchMutation.isPending ? 'Applying...' : showConfirm ? 'Confirm Apply' : 'Apply Changes'}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}

// Field editor component for different field types
interface FieldEditorProps {
  fieldName: string
  fieldDef: FieldDefinition
  manifest: Record<string, unknown>
  value: unknown
  onChange: (value: unknown) => void
}

function FieldEditor({ fieldName, fieldDef, manifest, value, onChange }: FieldEditorProps) {
  const currentValue = value !== undefined ? value : getNestedValue(manifest, fieldDef.path)

  if (fieldDef.type === 'number') {
    return (
      <div className="space-y-2">
        <Label htmlFor={fieldName}>{fieldDef.label}</Label>
        {fieldDef.description && (
          <p className="text-sm text-muted-foreground">{fieldDef.description}</p>
        )}
        <Input
          id={fieldName}
          type="number"
          min={fieldDef.min}
          max={fieldDef.max}
          value={typeof currentValue === 'number' ? currentValue : ''}
          onChange={(e) => onChange(e.target.value ? parseInt(e.target.value) : undefined)}
        />
      </div>
    )
  }

  if (fieldDef.type === 'string') {
    return (
      <div className="space-y-2">
        <Label htmlFor={fieldName}>{fieldDef.label}</Label>
        {fieldDef.description && (
          <p className="text-sm text-muted-foreground">{fieldDef.description}</p>
        )}
        <Input
          id={fieldName}
          type="text"
          placeholder={fieldDef.placeholder}
          value={typeof currentValue === 'string' ? currentValue : ''}
          onChange={(e) => onChange(e.target.value)}
        />
      </div>
    )
  }

  if (fieldDef.type === 'boolean') {
    return (
      <div className="flex items-center space-x-2">
        <input
          id={fieldName}
          type="checkbox"
          checked={typeof currentValue === 'boolean' ? currentValue : false}
          onChange={(e) => onChange(e.target.checked)}
          className="rounded border-border"
        />
        <Label htmlFor={fieldName}>{fieldDef.label}</Label>
      </div>
    )
  }

  // For complex types (array, object), show YAML editor
  return (
    <div className="space-y-2">
      <Label htmlFor={fieldName}>{fieldDef.label}</Label>
      {fieldDef.description && <p className="text-sm text-muted-foreground">{fieldDef.description}</p>}
      <textarea
        id={fieldName}
        className="w-full h-32 font-mono text-sm p-2 bg-muted rounded border border-border"
        value={value !== undefined ? YAML.dump(value) : YAML.dump(currentValue) || ''}
        onChange={(e) => {
          try {
            const parsed = YAML.load(e.target.value)
            onChange(parsed)
          } catch {
            // Invalid YAML, keep the text but don't update
          }
        }}
        spellCheck={false}
      />
    </div>
  )
}
