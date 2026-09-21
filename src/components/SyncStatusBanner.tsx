export function SyncStatusBanner({
  status,
  message,
}: {
  status: 'online' | 'offline' | 'syncing' | 'error'
  message?: string | null
}) {
  if (status === 'online' && !message) return null

  const label =
    message ||
    (status === 'offline'
      ? 'Offline — changes will sync when you reconnect'
      : status === 'syncing'
        ? 'Syncing…'
        : status === 'error'
          ? 'Could not sync — will retry when online'
          : null)

  if (!label) return null

  return (
    <div
      className={`sync-status sync-status--${status === 'online' ? 'syncing' : status}`}
      role="status"
    >
      {label}
    </div>
  )
}
