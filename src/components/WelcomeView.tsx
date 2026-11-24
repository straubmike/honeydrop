import { useEffect, useId, useState, type FormEvent, type ReactNode } from 'react'
import {
  joinCodeErrorMessage,
  type JoinCodeKind,
  type JoinCodeLookup,
} from '../api/joinCode'
import { isCustomName } from '../useOnboardingHints'
import { BrandMark } from './BrandMark'

export type WelcomeRedeemResult =
  | { ok: true; boardId?: string }
  | { ok: false; reason: string }

type Step =
  | { name: 'choose' }
  | { name: 'fresh-name' }
  | { name: 'code-entry'; code: string; error: string }
  | { name: 'invite-name'; code: string }
  | { name: 'working'; label: string }

interface WelcomeViewProps {
  busy?: boolean
  initialCode?: string | null
  syncBanner?: ReactNode
  onValidateCode: (code: string) => Promise<JoinCodeLookup>
  onStartFresh: (displayName: string) => Promise<WelcomeRedeemResult>
  onRedeemInvite: (code: string, displayName: string) => Promise<WelcomeRedeemResult>
  onRedeemRecovery: (code: string) => Promise<WelcomeRedeemResult>
  onRedeemDeviceLink: (code: string) => Promise<WelcomeRedeemResult>
}

export function WelcomeView({
  busy = false,
  initialCode = null,
  syncBanner,
  onValidateCode,
  onStartFresh,
  onRedeemInvite,
  onRedeemRecovery,
  onRedeemDeviceLink,
}: WelcomeViewProps) {
  const [step, setStep] = useState<Step>({ name: 'choose' })
  const [name, setName] = useState('')
  const [nameError, setNameError] = useState('')
  const [actionBusy, setActionBusy] = useState(false)
  const [bootstrappedCode, setBootstrappedCode] = useState<string | null>(null)
  const [recoveryHintOpen, setRecoveryHintOpen] = useState(false)
  const recoveryHintId = useId()

  const locked = busy || actionBusy

  useEffect(() => {
    const code = initialCode?.trim().toUpperCase()
    if (!code || bootstrappedCode === code) return
    setBootstrappedCode(code)
    setStep({ name: 'code-entry', code, error: '' })
    setActionBusy(true)
    void onValidateCode(code)
      .then((lookup) => applyLookup(code, lookup))
      .catch((error) => {
        setStep({
          name: 'code-entry',
          code,
          error: error instanceof Error ? error.message : 'Could not check that code.',
        })
      })
      .finally(() => setActionBusy(false))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialCode, bootstrappedCode])

  const applyLookup = (code: string, lookup: JoinCodeLookup) => {
    if (lookup.status !== 'valid' || !lookup.kind) {
      setStep({ name: 'code-entry', code, error: joinCodeErrorMessage(lookup) })
      return
    }
    if (lookup.kind === 'invite') {
      setName('')
      setNameError('')
      setStep({ name: 'invite-name', code })
      return
    }
    void redeemValidated(code, lookup.kind)
  }

  const redeemValidated = async (code: string, kind: Exclude<JoinCodeKind, 'invite'>) => {
    setActionBusy(true)
    setStep({
      name: 'working',
      label: kind === 'device_link' ? 'Linking this device…' : 'Recovering your seat…',
    })
    try {
      const result =
        kind === 'device_link' ? await onRedeemDeviceLink(code) : await onRedeemRecovery(code)
      if (!result.ok) {
        setStep({ name: 'code-entry', code, error: result.reason })
      }
    } catch (error) {
      setStep({
        name: 'code-entry',
        code,
        error: error instanceof Error ? error.message : 'Something went wrong.',
      })
    } finally {
      setActionBusy(false)
    }
  }

  const submitFresh = (event: FormEvent) => {
    event.preventDefault()
    if (!isCustomName(name)) {
      setNameError('Enter your name to continue.')
      return
    }
    setNameError('')
    setActionBusy(true)
    setStep({ name: 'working', label: 'Setting up…' })
    void onStartFresh(name.trim())
      .then((result) => {
        if (!result.ok) {
          setStep({ name: 'fresh-name' })
          setNameError(result.reason)
        }
      })
      .catch((error) => {
        setStep({ name: 'fresh-name' })
        setNameError(error instanceof Error ? error.message : 'Could not start.')
      })
      .finally(() => setActionBusy(false))
  }

  const submitCode = (event: FormEvent) => {
    event.preventDefault()
    const current = step.name === 'code-entry' ? step.code.trim().toUpperCase() : ''
    if (current.length < 4) {
      setStep({ name: 'code-entry', code: current, error: 'Enter a valid code.' })
      return
    }
    setActionBusy(true)
    void onValidateCode(current)
      .then((lookup) => applyLookup(current, lookup))
      .catch((error) => {
        setStep({
          name: 'code-entry',
          code: current,
          error: error instanceof Error ? error.message : 'Could not check that code.',
        })
      })
      .finally(() => setActionBusy(false))
  }

  const submitInviteName = (event: FormEvent) => {
    event.preventDefault()
    if (step.name !== 'invite-name') return
    if (!isCustomName(name)) {
      setNameError('Enter your name to continue.')
      return
    }
    setNameError('')
    setActionBusy(true)
    const code = step.code
    setStep({ name: 'working', label: 'Joining board…' })
    void onRedeemInvite(code, name.trim())
      .then((result) => {
        if (!result.ok) {
          setStep({ name: 'invite-name', code })
          setNameError(result.reason)
        }
      })
      .catch((error) => {
        setStep({ name: 'invite-name', code })
        setNameError(error instanceof Error ? error.message : 'Could not join.')
      })
      .finally(() => setActionBusy(false))
  }

  return (
    <div className="shell shell--welcome">
      {syncBanner}
      <header className="welcome__brand">
        <BrandMark className="pin pin--welcome" />
        <h1>Honey Drop</h1>
      </header>

      {step.name === 'choose' ? (
        <section className="welcome" aria-label="Welcome">
          <div className="welcome__actions">
            <button
              type="button"
              className="primary welcome__btn"
              disabled={locked}
              onClick={() => {
                setName('')
                setNameError('')
                setStep({ name: 'fresh-name' })
              }}
            >
              New User
            </button>
            <button
              type="button"
              className="ghost welcome__btn"
              disabled={locked}
              onClick={() => setStep({ name: 'code-entry', code: '', error: '' })}
            >
              Have a code
            </button>
          </div>
          <div className="welcome__hint">
            <button
              type="button"
              className="text-btn welcome__hint-toggle"
              aria-expanded={recoveryHintOpen}
              aria-controls={recoveryHintId}
              onClick={() => setRecoveryHintOpen((open) => !open)}
            >
              Lost your boards?
            </button>
            {recoveryHintOpen ? (
              <p className="welcome__hint-body" id={recoveryHintId}>
                Ask your partner to generate a recovery code by tapping your name inside your shared
                board and input it above.
              </p>
            ) : null}
          </div>
        </section>
      ) : null}

      {step.name === 'fresh-name' ? (
        <section className="welcome">
          <form className="welcome__form" onSubmit={submitFresh}>
            <label className="field">
              <span>Your name</span>
              <input
                value={name}
                onChange={(event) => {
                  setName(event.target.value)
                  setNameError('')
                }}
                maxLength={32}
                autoFocus
                autoComplete="nickname"
                disabled={locked}
              />
            </label>
            {nameError ? <p className="field-error">{nameError}</p> : null}
            <div className="welcome__form-actions">
              <button
                type="button"
                className="ghost"
                disabled={locked}
                onClick={() => setStep({ name: 'choose' })}
              >
                Back
              </button>
              <button type="submit" className="primary" disabled={locked}>
                Continue
              </button>
            </div>
          </form>
        </section>
      ) : null}

      {step.name === 'code-entry' ? (
        <section className="welcome">
          <form className="welcome__form" onSubmit={submitCode}>
            <label className="field">
              <span>Code</span>
              <input
                value={step.code}
                onChange={(event) =>
                  setStep({
                    name: 'code-entry',
                    code: event.target.value.toUpperCase(),
                    error: '',
                  })
                }
                placeholder="ABC123"
                maxLength={12}
                autoFocus
                autoCapitalize="characters"
                disabled={locked}
              />
            </label>
            {step.error ? <p className="field-error">{step.error}</p> : null}
            <div className="welcome__form-actions">
              <button
                type="button"
                className="ghost"
                disabled={locked}
                onClick={() => setStep({ name: 'choose' })}
              >
                Back
              </button>
              <button type="submit" className="primary" disabled={locked}>
                Continue
              </button>
            </div>
          </form>
        </section>
      ) : null}

      {step.name === 'invite-name' ? (
        <section className="welcome">
          <form className="welcome__form" onSubmit={submitInviteName}>
            <label className="field">
              <span>Your name</span>
              <input
                value={name}
                onChange={(event) => {
                  setName(event.target.value)
                  setNameError('')
                }}
                maxLength={32}
                autoFocus
                autoComplete="nickname"
                disabled={locked}
              />
            </label>
            {nameError ? <p className="field-error">{nameError}</p> : null}
            <div className="welcome__form-actions">
              <button
                type="button"
                className="ghost"
                disabled={locked}
                onClick={() => setStep({ name: 'code-entry', code: step.code, error: '' })}
              >
                Back
              </button>
              <button type="submit" className="primary" disabled={locked}>
                Join
              </button>
            </div>
          </form>
        </section>
      ) : null}

      {step.name === 'working' ? (
        <section className="welcome">
          <p className="muted welcome__status">{step.label}</p>
        </section>
      ) : null}
    </div>
  )
}
