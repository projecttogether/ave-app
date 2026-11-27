'use client'

import * as React from 'react'
import { useActionState } from 'react'
import { requestOtp, verifyOtp } from '@/app/actions/auth'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { AlertCircle, ArrowLeft, KeyRound, Loader2 } from 'lucide-react'
import { signIn } from 'next-auth/webauthn'

export default function LoginClient({ callbackUrl }: { callbackUrl: string }) {
    const [email, setEmail] = React.useState('')
    const [otpState, otpDispatch, otpPending] = useActionState(requestOtp, undefined)
    const [verifyState, verifyDispatch, verifyPending] = useActionState(verifyOtp, undefined)
    const [code, setCode] = React.useState('')
    const [resendCooldown, setResendCooldown] = React.useState(0)
    const [passkeyError, setPasskeyError] = React.useState<string | null>(null)
    const [passkeyLoading, setPasskeyLoading] = React.useState(false)
    const [webAuthnAvailable, setWebAuthnAvailable] = React.useState(true)
    const codeInputRef = React.useRef<HTMLInputElement>(null)

    React.useEffect(() => {
        if (typeof window !== 'undefined' && !window.PublicKeyCredential) {
            setWebAuthnAvailable(false)
        }
    }, [])

    // Determine which step we're on
    const showOtpInput = otpState?.success && otpState?.email

    // Focus code input when OTP step appears
    React.useEffect(() => {
        if (showOtpInput) {
            setTimeout(() => codeInputRef.current?.focus(), 100)
        }
    }, [showOtpInput])

    // Resend cooldown timer
    React.useEffect(() => {
        if (resendCooldown <= 0) return
        const timer = setTimeout(() => setResendCooldown(resendCooldown - 1), 1000)
        return () => clearTimeout(timer)
    }, [resendCooldown])

    function handleResend() {
        if (resendCooldown > 0 || otpPending) return
        setCode('')
        setResendCooldown(60)
        const formData = new FormData()
        formData.set('email', otpState!.email!)
        formData.set('callbackUrl', callbackUrl)
        otpDispatch(formData)
    }

    if (showOtpInput) {
        const currentEmail = verifyState?.email || otpState?.email
        const currentCallbackUrl = verifyState?.callbackUrl || otpState?.callbackUrl || callbackUrl
        return (
            <div className="w-full space-y-6">
                <form action={verifyDispatch}>
                    <input type="hidden" name="email" value={currentEmail} />
                    <input type="hidden" name="callbackUrl" value={currentCallbackUrl} />
                    <div className="space-y-4">
                        <div className="text-center">
                            <p className="text-sm text-muted-foreground">
                                Falls für <strong>{currentEmail}</strong> ein Konto besteht, haben wir einen Anmeldecode gesendet.
                            </p>
                        </div>

                        <div className="space-y-1.5">
                            <Label htmlFor="code">Anmeldecode</Label>
                            <Input
                                ref={codeInputRef}
                                id="code"
                                name="code"
                                type="text"
                                inputMode="numeric"
                                pattern="[0-9]*"
                                maxLength={6}
                                placeholder="000000"
                                required
                                autoComplete="one-time-code"
                                value={code}
                                onChange={(e) => {
                                    const val = e.target.value.replace(/\D/g, '')
                                    setCode(val)
                                    e.target.setCustomValidity('')
                                }}
                                onInvalid={(e) => {
                                    const input = e.currentTarget
                                    if (input.validity.valueMissing) {
                                        input.setCustomValidity('Bitte geben Sie den 6-stelligen Code aus der E-Mail ein.')
                                    } else if (input.validity.patternMismatch || input.validity.tooShort) {
                                        input.setCustomValidity('Der Code muss 6 Ziffern lang sein.')
                                    } else {
                                        input.setCustomValidity('')
                                    }
                                }}
                                className="text-center text-2xl tracking-[0.3em] font-mono"
                            />
                        </div>

                        {verifyState?.error && (
                            <div className="flex items-center space-x-2 text-sm text-red-600 bg-red-50 p-2 rounded">
                                <AlertCircle className="h-4 w-4 shrink-0" />
                                <p>{verifyState.error}</p>
                            </div>
                        )}

                        <Button className="w-full" type="submit" disabled={verifyPending || code.length !== 6}>
                            {verifyPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                            <span>{verifyPending ? 'Wird angemeldet...' : 'Anmelden'}</span>
                        </Button>
                    </div>
                </form>

                <div className="flex flex-col gap-2">
                    <Button
                        type="button"
                        variant="ghost"
                        className="w-full"
                        disabled={resendCooldown > 0 || otpPending}
                        onClick={handleResend}
                    >
                        {otpPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                        <span>{otpPending ? 'Wird gesendet...' : resendCooldown > 0
                            ? `Code erneut senden (${resendCooldown}s)` : 'Code erneut senden'}</span>
                    </Button>
                    <Button
                        asChild
                        variant="ghost"
                        className="w-full"
                    >
                        {/* Plain <a> (not <Link>): a full page load is required to clear the OTP action state */}
                        <a href={`/login?callbackUrl=${encodeURIComponent(callbackUrl)}`}>
                            <ArrowLeft className="mr-2 h-4 w-4" />
                            Andere E-Mail verwenden
                        </a>
                    </Button>
                </div>

                {/* Privacy Policy */}
                <p className="text-center text-xs text-muted-foreground">
                    Mit der Anmeldung stimmen Sie unserer{' '}
                    <a
                        href="https://ave-gastro.org/datenschutz/"
                        target="_blank"
                        rel="noopener noreferrer"
                        className="underline underline-offset-4 hover:text-primary"
                    >
                        Datenschutzerklärung
                    </a>{' '}
                    zu.
                </p>
            </div>
        )
    }

    return (
        <div className="w-full space-y-6">
            <form action={otpDispatch}>
                <input type="hidden" name="callbackUrl" value={callbackUrl} />
                <div className="space-y-4">
                    <div className="space-y-1.5">
                        <Label htmlFor="email">E-Mail</Label>
                        <Input
                            id="email"
                            name="email"
                            type="email"
                            placeholder="name@example.com"
                            required
                            value={email}
                            onChange={(e) => {
                                setEmail(e.target.value)
                                e.target.setCustomValidity('')
                            }}
                            onInvalid={(e) => {
                                const input = e.currentTarget
                                if (input.validity.valueMissing) {
                                    input.setCustomValidity('Bitte geben Sie Ihre E-Mail-Adresse ein.')
                                } else if (input.validity.typeMismatch) {
                                    input.setCustomValidity('Bitte geben Sie eine gültige E-Mail-Adresse ein.')
                                } else {
                                    input.setCustomValidity('')
                                }
                            }}
                        />
                    </div>

                    {otpState?.error && (
                        <div className="flex items-center space-x-2 text-sm text-red-600 bg-red-50 p-2 rounded">
                            <AlertCircle className="h-4 w-4 shrink-0" />
                            <p>{otpState.error}</p>
                        </div>
                    )}

                    <Button className="w-full" type="submit" disabled={otpPending}>
                        {otpPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                        <span>{otpPending ? 'Wird gesendet...' : 'Anmeldecode senden'}</span>
                    </Button>
                </div>
            </form>

            {webAuthnAvailable && (
                <>
                    {/* Divider */}
                    <div className="relative">
                        <div className="absolute inset-0 flex items-center">
                            <span className="w-full border-t" />
                        </div>
                        <div className="relative flex justify-center text-xs uppercase">
                            <span className="bg-white px-2 text-muted-foreground">
                                Oder weiter mit
                            </span>
                        </div>
                    </div>

                    {/* Passkey Button */}
                    <div className="space-y-2">
                        {passkeyError && (
                            <div className="flex items-center space-x-2 text-sm text-red-600 bg-red-50 p-2 rounded">
                                <AlertCircle className="h-4 w-4 shrink-0" />
                                <p>{passkeyError}</p>
                            </div>
                        )}
                        <Button
                            type="button"
                            variant="outline"
                            className="w-full"
                            disabled={passkeyLoading}
                            onClick={async (e) => {
                                e.preventDefault();
                                setPasskeyError(null)
                                setPasskeyLoading(true)
                                try {
                                    // Discoverable passkeys only: the server never lists an account's credentials.
                                    const params: any = { action: 'authenticate', redirect: false, callbackUrl };

                                    const res = await signIn('webauthn', params) as any;

                                    if (res?.error) {
                                        setPasskeyError('Passkey-Anmeldung fehlgeschlagen. Bitte versuchen Sie es erneut oder nutzen Sie den E-Mail-Code.');
                                    } else if (res && res.url) {
                                        window.location.href = res.url;
                                    }
                                } catch (err: any) {
                                    switch (err?.name) {
                                        case 'NotAllowedError':
                                            setPasskeyError('Passkey-Anmeldung wurde abgebrochen oder ist auf diesem Gerät nicht hinterlegt.');
                                            break;
                                        case 'InvalidStateError':
                                            setPasskeyError('Dieser Passkey ist auf diesem Gerät nicht registriert. Nutzen Sie den E-Mail-Code oder registrieren Sie das Gerät erneut.');
                                            break;
                                        case 'SecurityError':
                                            setPasskeyError('Sicherheitsfehler beim Passkey. Bitte stellen Sie sicher, dass Sie die offizielle Domain verwenden.');
                                            break;
                                        case 'NotSupportedError':
                                            setPasskeyError('Ihr Browser unterstützt keine Passkeys. Bitte nutzen Sie den E-Mail-Code.');
                                            break;
                                        default:
                                            setPasskeyError('Passkey-Anmeldung fehlgeschlagen. Bitte nutzen Sie den E-Mail-Code.');
                                    }
                                } finally {
                                    setPasskeyLoading(false)
                                }
                            }}
                        >
                            <KeyRound className="mr-2 h-4 w-4" />
                            {passkeyLoading ? 'Wird überprüft...' : 'Mit Passkey anmelden'}
                        </Button>
                    </div>
                </>
            )}

            {/* Privacy Policy */}
            <p className="text-center text-xs text-muted-foreground">
                Mit der Anmeldung stimmen Sie unserer{' '}
                <a
                    href="https://ave-gastro.org/datenschutz/"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="underline underline-offset-4 hover:text-primary"
                >
                    Datenschutzerklärung
                </a>{' '}
                zu.
            </p>
        </div>
    )
}
