"use client"

import { signInWithRedirect } from "aws-amplify/auth"
import { useRouter } from "next/navigation"
import { useEffect, useRef } from "react"

import { useAuth } from "@/components/auth-provider"
import { AuthLoading } from "@/components/require-auth"
import { SiteHeader } from "@/components/site-header"
import { configureAuth, isAuthConfigured } from "@/lib/auth"

/**
 * /login/ — the URL submitted for grading.
 *
 * As soon as this page loads it redirects the browser to Cognito's managed
 * login page, which shows both the email-and-password form and the "Continue
 * with Google" button.  The redirect must start here (not from a pasted
 * Cognito URL) so the OIDC library can store a PKCE code_verifier and state
 * before leaving.
 *
 * If the user is already signed in, it sends them straight to /today.
 */
export default function LoginPage() {
  const { status } = useAuth()
  const router = useRouter()
  const redirected = useRef(false)

  useEffect(() => {
    if (status === "signedIn") {
      router.replace("/today")
      return
    }

    if (status !== "signedOut") return // still loading
    if (redirected.current) return // only once
    if (!isAuthConfigured) return

    redirected.current = true
    configureAuth()
    // Amplify's signInWithRedirect without a provider param goes to
    // Cognito's managed login, which shows every enabled provider.
    void signInWithRedirect()
  }, [status, router])

  if (!isAuthConfigured) {
    return (
      <>
        <SiteHeader />
        <div className="flex flex-1 flex-col items-center justify-center p-8 text-center">
          <p className="text-muted-foreground text-sm">
            Sign-in isn&apos;t configured yet. Run{" "}
            <code className="bg-muted rounded px-1.5 py-0.5 text-xs">make aws-deploy-auth</code> and
            put the values from{" "}
            <code className="bg-muted rounded px-1.5 py-0.5 text-xs">make aws-auth-env</code> in{" "}
            <code className="bg-muted rounded px-1.5 py-0.5 text-xs">.env</code>.
          </p>
        </div>
      </>
    )
  }

  return (
    <>
      <SiteHeader />
      <AuthLoading label="Redirecting to sign in…" />
    </>
  )
}

