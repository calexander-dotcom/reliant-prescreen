"use client";

import { useEffect, useState } from "react";
import { ApiError, apiLogin } from "@/lib/api";
import { loadToken, saveToken } from "@/lib/storage";
import { Banner, Button, Card, Field, SectionTitle, Spinner, inputClass } from "./ui";

/**
 * GHIN sign-in.
 *
 * The password goes to this app's own route, which calls GHIN server-side and
 * hands back a session token. The token lives in sessionStorage — it is gone
 * when the tab closes, and the password is never stored anywhere.
 */
export function GhinPanel({
  token,
  onToken,
}: {
  token: string | null;
  onToken: (token: string | null) => void;
}) {
  const [emailOrGhin, setEmailOrGhin] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [detail, setDetail] = useState<string | null>(null);

  useEffect(() => {
    const stored = loadToken();
    if (stored && !token) onToken(stored);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const signIn = async () => {
    setBusy(true);
    setError(null);
    setDetail(null);
    try {
      const next = await apiLogin(emailOrGhin, password);
      saveToken(next);
      onToken(next);
      setPassword("");
    } catch (caught) {
      setError(
        caught instanceof ApiError ? caught.message : "Could not sign in to GHIN.",
      );
      setDetail(caught instanceof ApiError ? caught.detail : null);
    } finally {
      setBusy(false);
    }
  };

  if (token) {
    return (
      <Card>
        <div className="flex items-center justify-between gap-3">
          <div>
            <div className="font-bold text-turf-900">GHIN connected</div>
            <p className="text-sm text-neutral-600">
              Your favorites and courses can be imported.
            </p>
          </div>
          <Button
            variant="secondary"
            onClick={() => {
              saveToken(null);
              onToken(null);
            }}
          >
            Sign out
          </Button>
        </div>
      </Card>
    );
  }

  return (
    <Card>
      <SectionTitle hint="Used once to pull your favorites and course list. Optional — you can enter players by hand instead.">
        Connect GHIN
      </SectionTitle>

      <div className="space-y-3">
        <Field label="GHIN email or number">
          <input
            value={emailOrGhin}
            onChange={(event) => setEmailOrGhin(event.target.value)}
            autoComplete="username"
            inputMode="email"
            className={inputClass}
            placeholder="you@example.com"
          />
        </Field>
        <Field label="GHIN password">
          <input
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            type="password"
            autoComplete="current-password"
            className={inputClass}
            onKeyDown={(event) => {
              if (event.key === "Enter" && emailOrGhin && password) void signIn();
            }}
          />
        </Field>

        {error ? (
          <Banner tone="error">
            <div className="font-semibold">{error}</div>
            {detail ? (
              <div className="mt-1 break-words font-mono text-xs opacity-80">
                {detail}
              </div>
            ) : null}
          </Banner>
        ) : null}

        <div className="flex items-center gap-3">
          <Button onClick={() => void signIn()} disabled={busy || !emailOrGhin || !password}>
            {busy ? "Signing in…" : "Sign in"}
          </Button>
          {busy ? <Spinner /> : null}
        </div>

        <p className="text-xs text-neutral-500">
          GHIN has no public API, so this uses the same private endpoints the GHIN
          app uses. It can break without warning, and everything here works
          without it.
        </p>
      </div>
    </Card>
  );
}
