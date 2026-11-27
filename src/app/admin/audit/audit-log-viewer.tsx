'use client'

import { useEffect, useState, useCallback } from 'react'
import { getAuditLogs, type AuditLogEntry } from './actions'

const SEVERITY_COLORS: Record<string, string> = {
  info: 'bg-blue-100 text-blue-800',
  warning: 'bg-yellow-100 text-yellow-800',
  critical: 'bg-red-100 text-red-800',
}

const PAGE_SIZE = 50

export function AuditLogViewer() {
  const [logs, setLogs] = useState<AuditLogEntry[]>([])
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(1)
  const [loading, setLoading] = useState(true)
  const [actionFilter, setActionFilter] = useState('')
  const [severityFilter, setSeverityFilter] = useState('')

  const fetchLogs = useCallback(async () => {
    setLoading(true)
    try {
      const result = await getAuditLogs({
        page,
        pageSize: PAGE_SIZE,
        action: actionFilter || undefined,
        severity: severityFilter || undefined,
      })
      setLogs(result.logs)
      setTotal(result.total)
    } catch (err) {
      console.error('Failed to fetch audit logs:', err)
    } finally {
      setLoading(false)
    }
  }, [page, actionFilter, severityFilter])

  useEffect(() => {
    fetchLogs()
  }, [fetchLogs])

  const totalPages = Math.ceil(total / PAGE_SIZE)

  return (
    <div className="space-y-4">
      {/* Filters */}
      <div className="flex gap-3 flex-wrap">
        <select
          className="border rounded px-3 py-1.5 text-sm bg-background"
          value={actionFilter}
          onChange={(e) => { setActionFilter(e.target.value); setPage(1) }}
        >
          <option value="">Alle Aktionen</option>
          <option value="auth.login">Login</option>
          <option value="auth.login_failed">Login fehlgeschlagen</option>
          <option value="auth.logout">Logout</option>
          <option value="admin.user_create">Benutzer erstellt</option>
          <option value="admin.user_update">Benutzer aktualisiert</option>
          <option value="admin.user_delete">Benutzer geloescht</option>
          <option value="admin.user_deactivate">Benutzer deaktiviert</option>
          <option value="admin.role_change">Rolle geaendert</option>
          <option value="admin.impersonate_start">Impersonation gestartet</option>
          <option value="admin.impersonate_stop">Impersonation beendet</option>
          <option value="admin.org_create">Organisation erstellt</option>
          <option value="admin.org_delete">Organisation geloescht</option>
          <option value="admin.invite_sent">Einladung gesendet</option>
          <option value="org.invitation_created">Teameinladung erstellt</option>
          <option value="org.invitation_sent">Teameinladung gesendet</option>
          <option value="org.invitation_renewed">Teameinladung erneuert</option>
          <option value="org.invitation_cancelled">Teameinladung widerrufen</option>
          <option value="org.member_suspended">Teamzugang gesperrt</option>
          <option value="org.member_kitchens_updated">Küchenzuweisung geändert</option>
          <option value="data.create">Daten erstellt</option>
          <option value="data.update">Daten aktualisiert</option>
          <option value="data.csv_import">CSV Import</option>
          <option value="data.freeze">Jahr gesperrt</option>
          <option value="data.unfreeze">Jahr entsperrt</option>
          <option value="authz.denied">Zugriff verweigert</option>
        </select>
        <select
          className="border rounded px-3 py-1.5 text-sm bg-background"
          value={severityFilter}
          onChange={(e) => { setSeverityFilter(e.target.value); setPage(1) }}
        >
          <option value="">Alle Schweregrade</option>
          <option value="info">Info</option>
          <option value="warning">Warnung</option>
          <option value="critical">Kritisch</option>
        </select>
        <button
          onClick={fetchLogs}
          className="border rounded px-3 py-1.5 text-sm hover:bg-muted"
        >
          Aktualisieren
        </button>
      </div>

      {/* Table */}
      <div className="border rounded-lg overflow-auto">
        <table className="w-full text-sm">
          <thead className="bg-muted/50">
            <tr>
              <th className="text-left px-3 py-2 font-medium">Zeitpunkt</th>
              <th className="text-left px-3 py-2 font-medium">Benutzer</th>
              <th className="text-left px-3 py-2 font-medium">Aktion</th>
              <th className="text-left px-3 py-2 font-medium">Ressource</th>
              <th className="text-left px-3 py-2 font-medium">Schweregrad</th>
              <th className="text-left px-3 py-2 font-medium">Details</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td colSpan={6} className="text-center py-8 text-muted-foreground">
                  Laden...
                </td>
              </tr>
            ) : logs.length === 0 ? (
              <tr>
                <td colSpan={6} className="text-center py-8 text-muted-foreground">
                  Keine Eintraege gefunden.
                </td>
              </tr>
            ) : (
              logs.map((log) => (
                <tr key={log.id} className="border-t hover:bg-muted/25">
                  <td className="px-3 py-2 whitespace-nowrap">
                    {new Date(log.timestamp).toLocaleString('de-DE')}
                  </td>
                  <td className="px-3 py-2 max-w-[200px] truncate">
                    {log.userEmail || log.userId || '-'}
                  </td>
                  <td className="px-3 py-2 font-mono text-xs">
                    {log.action}
                  </td>
                  <td className="px-3 py-2 font-mono text-xs max-w-[200px] truncate">
                    {log.resource || '-'}
                  </td>
                  <td className="px-3 py-2">
                    <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${SEVERITY_COLORS[log.severity] || ''}`}>
                      {log.severity}
                    </span>
                  </td>
                  <td className="px-3 py-2 max-w-[300px] truncate text-xs text-muted-foreground">
                    {log.details ? JSON.stringify(log.details) : '-'}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between">
          <span className="text-sm text-muted-foreground">
            {total} Eintraege, Seite {page} von {totalPages}
          </span>
          <div className="flex gap-2">
            <button
              disabled={page <= 1}
              onClick={() => setPage((p) => p - 1)}
              className="border rounded px-3 py-1 text-sm disabled:opacity-50 hover:bg-muted"
            >
              Zurueck
            </button>
            <button
              disabled={page >= totalPages}
              onClick={() => setPage((p) => p + 1)}
              className="border rounded px-3 py-1 text-sm disabled:opacity-50 hover:bg-muted"
            >
              Weiter
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
