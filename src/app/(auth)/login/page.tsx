import { Metadata } from 'next'
import LoginClient from './login-client'
import { normalizeCallbackUrl } from '@/lib/auth/callback-url'
import { auth } from '@/auth'
import { redirect } from 'next/navigation'

export const metadata: Metadata = {
    title: "Anmelden",
}

export default async function LoginPage(props: {
    searchParams: Promise<{ callbackUrl?: string | string[] }>
}) {
    const searchParams = await props.searchParams
    const callbackUrl = normalizeCallbackUrl(searchParams.callbackUrl)
    const session = await auth()
    if (session?.user?.email) redirect(callbackUrl)

    return <LoginClient callbackUrl={callbackUrl} />
}
