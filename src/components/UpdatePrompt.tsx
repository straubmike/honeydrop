import { useRegisterSW } from 'virtual:pwa-register/react'

const CHECK_MS = 5 * 60 * 1000

export function UpdatePrompt() {
  const {
    needRefresh: [needRefresh],
    updateServiceWorker,
  } = useRegisterSW({
    immediate: true,
    onRegisteredSW(_swUrl, registration) {
      if (!registration) return

      const check = () => {
        void registration.update()
      }

      window.setInterval(check, CHECK_MS)
      document.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'visible') check()
      })
      window.addEventListener('focus', check)
    },
  })

  if (!needRefresh) return null

  return (
    <div className="install-tip install-tip--update" role="status">
      <p className="install-tip__text">A new version of Honey Drop is ready.</p>
      <div className="install-tip__actions">
        <button type="button" className="primary" onClick={() => void updateServiceWorker(true)}>
          Refresh
        </button>
      </div>
    </div>
  )
}
