import { useEffect, useState } from 'react'

const DISMISS_KEY = 'honeydrop.installDismissed'

type BeforeInstallPromptEvent = Event & {
  prompt: () => Promise<void>
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>
}

function isStandalone(): boolean {
  if (typeof window === 'undefined') return false
  const mq = window.matchMedia('(display-mode: standalone)').matches
  const ios = 'standalone' in navigator && Boolean((navigator as Navigator & { standalone?: boolean }).standalone)
  return mq || ios
}

export function InstallPrompt() {
  const [deferred, setDeferred] = useState<BeforeInstallPromptEvent | null>(null)
  const [visible, setVisible] = useState(false)

  useEffect(() => {
    if (isStandalone()) return
    try {
      if (localStorage.getItem(DISMISS_KEY) === '1') return
    } catch {
      /* ignore */
    }

    const onPrompt = (event: Event) => {
      event.preventDefault()
      setDeferred(event as BeforeInstallPromptEvent)
      setVisible(true)
    }
    window.addEventListener('beforeinstallprompt', onPrompt)
    return () => window.removeEventListener('beforeinstallprompt', onPrompt)
  }, [])

  if (!visible || !deferred) return null

  const dismiss = () => {
    setVisible(false)
    setDeferred(null)
    try {
      localStorage.setItem(DISMISS_KEY, '1')
    } catch {
      /* ignore */
    }
  }

  const install = () => {
    void deferred.prompt().then(() => deferred.userChoice).finally(() => {
      setVisible(false)
      setDeferred(null)
    })
  }

  return (
    <div className="install-tip" role="status">
      <p className="install-tip__text">Install Honey Drop for a full-screen app on your home screen.</p>
      <div className="install-tip__actions">
        <button type="button" className="primary" onClick={install}>
          Install
        </button>
        <button type="button" className="ghost" onClick={dismiss}>
          Not now
        </button>
      </div>
    </div>
  )
}
