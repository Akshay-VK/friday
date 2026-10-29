import { useEffect, useState } from 'react'
import { approveSource, cancelSource, disableSource, listSources, pickSource, previewSource, revokeSource, type Source, type SourcePreview } from './api.ts'

export function Sources({ ready, refreshKey }: { ready: boolean; refreshKey: number }) {
  const [sources, setSources] = useState<Source[]>([])
  const [path, setPath] = useState('')
  const [exclusions, setExclusions] = useState('')
  const [preview, setPreview] = useState<SourcePreview | null>(null)
  const [message, setMessage] = useState('No local-read permission is configured. Nothing is scanned automatically.')
  const [busy, setBusy] = useState(false)
  useEffect(() => {
    if (ready) void listSources().then((state) => setSources(state.sources)).catch(() => setMessage('Could not load scan roots. Retry after reconnecting to Friday.'))
  }, [ready, refreshKey])
  const refresh = async () => setSources((await listSources()).sources)
  const run = async (work: () => Promise<void>) => {
    setBusy(true)
    try { await work() } catch (error) { setMessage(error instanceof Error ? error.message : String(error)) }
    finally { setBusy(false) }
  }
  const cancel = () => void run(async () => {
    if (preview) await cancelSource(preview.previewId)
    setPreview(null)
    setMessage('Preview cancelled. No permission was saved.')
  })
  return <section className="actions" aria-labelledby="sources-title">
    <div className="section-head"><h2 id="sources-title" className="title-large">Scan roots</h2><p className="section-head__note">Local reads only. Network access and Open / Run execution require separate permission; preview never follows URLs or runs commands.</p></div>
    <p role="status">{message}</p>
    <ul>{sources.map((source) => <li key={source.id}>
      <code>{source.path}</code> · {source.host} · {source.enabled ? 'Local reads permitted' : 'Disabled; no reads'} · {source.health}
      {source.exclusions.length > 0 && <span> · excludes {source.exclusions.join(', ')}</span>}{' '}
      <button type="button" className="button button--quiet" disabled={!ready || busy || !source.enabled} onClick={() => void run(async () => { await disableSource(source); await refresh(); setMessage('Scan root disabled. To use it again, preview and approve a new scope.') })}>Disable</button>{' '}
      <button type="button" className="button button--quiet" disabled={!ready || busy} onClick={() => void run(async () => { await revokeSource(source); await refresh(); setMessage('Scan root revoked.') })}>Revoke</button>
    </li>)}</ul>
    <div><label htmlFor="source-path">Native folder path</label>{' '}
      <input id="source-path" value={path} onChange={(event) => { setPath(event.target.value); setPreview(null) }} disabled={!ready || busy} autoComplete="off" />{' '}
      <button type="button" className="button button--quiet" disabled={!ready || busy} onClick={() => void run(async () => { const result = await pickSource(); if (result.kind === 'selected') { setPath(result.path); setPreview(null); setMessage('Folder selected. Preview still requires your action.') } else setMessage(result.kind === 'cancelled' ? 'Picker cancelled. No permission saved.' : result.message) })}>Browse on Windows</button>
    </div>
    <div><label htmlFor="source-exclusions">Exclude top-level folders (comma separated)</label>{' '}
      <input id="source-exclusions" value={exclusions} onChange={(event) => { setExclusions(event.target.value); setPreview(null) }} disabled={!ready || busy} placeholder="e.g. .git, node_modules" /></div>
    <button type="button" className="button button--primary" disabled={!ready || busy || !path || Boolean(preview)} onClick={() => void run(async () => {
      const result = await previewSource(path, exclusions.split(',').map((part) => part.trim()).filter(Boolean))
      setPreview(result)
      setMessage('Temporary local preview only; no persistent grant yet.')
    })}>Preview local reads temporarily</button>
    {preview && <div role="group" aria-label="Review scan root">
      <p>Review exact scope: <code>{preview.path}</code> ({preview.host}); resolved native path <code>{preview.nativePath}</code>. Exclusions: {preview.exclusions.join(', ') || 'none'}.</p>
      <p>Metadata names only, depth {preview.depth}, first {preview.entryLimit} entries. {preview.truncated ? 'Truncated; more entries were not inspected.' : 'Within preview limit.'} Links skipped: {preview.skipped.join(', ') || 'none'}.</p>
      <ul>{preview.sample.map((name) => <li key={name}>{name}</li>)}</ul>
      <button type="button" className="button button--primary" disabled={busy} onClick={() => void run(async () => { await approveSource(preview); setPreview(null); await refresh(); setMessage('Exact local-read scan root approved. No network or execution permission granted.') })}>Approve exact scan root</button>{' '}
      <button type="button" className="button button--quiet" disabled={busy} onClick={cancel}>Cancel preview</button>
    </div>}
    <p>Offline or inaccessible? Reconnect the folder or correct its permissions, then retry. Keep a root disabled or revoke it if it is no longer needed.</p>
  </section>
}
