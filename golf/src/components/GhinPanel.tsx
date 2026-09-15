"use client";

import { useEffect, useState } from "react";
import { ApiError, apiLogin } from "@/lib/api";
import { normalizeGolferId } from "@/lib/ghin/client";
import { loadGolferId, loadToken, saveGolferId, saveToken } from "@/lib/storage";
import { Banner, Button, Card, Field, SectionTitle, Spinner, inputClass } from "./ui";

export interface GhinConnection {
  token: string | null;
  golferId: string | null;
}

/**
 * GHIN sign-in.
 *
 * Both halves are needed. The token authorises the call — a request without one
 * comes back 401 "Invalid token" — and the GHIN number is a path segment in the
 * endpoints that list who you follow and which courses you play. The number
 * usually comes out of the login response; when it does not, it is asked for.
 *
 * The password is posted to this app's own route, which calls GHIN server-side,
 * and is never stored. The token lives in sessionStorage and is gone when the
 * tab closes. The GHIN number is not a secret and is kept for next time.
 */
export function GhinPanel({
  connection,
  onChange,
}: {
  connection: GhinConnection;
  onChange: (connection: GhinConnection) => void;
}) {
  const [emailOrGhin, setEmailOrGhin] = useState("");
  const [password, setPassword] = useState("");
  const [numberDraft, setNumberDraft] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [detail, setDetail] = useState<string | null>(null);
  const [shape, setShape] = useState<string | null>(null);

  useEffect(() => {
    const token = loadToken();
    const golferId = loadGolferId();
    if ((token || golferId) && !connection.token && !connection.golferId) {
      onChange({ token, golferId });
    }
    if (golferId) setNumberDraft(golferId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const signIn = async () => {
    setBusy(true);
    setError(null);
    setDetail(null);
    try {
      const session = await apiLogin(emailOrGhin, password);
      saveToken(session.token);

      // Prefer the number GHIN itself reports over anything typed before.
      const golferId = session.golferId ?? loadGolferId();
      if (golferId) saveGolferId(golferId);
      if (golferId) setNumberDraft(golferId);

      // Only worth showing when the number could not be found.
      setShape(session.golferId ? null : session.shape);
      onChange({ token: session.token, golferId });
      setPassword("");
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.message : "Could not sign in to GHIN.");
      setDetail(caught instanceof ApiError ? caught.detail : null);
    } finally {
      setBusy(false);
    }
  };

  const setNumber = () => {
    const id = normalizeGolferId(numberDraft);
    if (!id) {
      setError("A GHIN number is 7 digits, give or take.");
      return;
    }
    setError(null);
    saveGolferId(id);
    onChange({ ...connection, golferId: id });
  };

  if (connection.token) {
    return (
      <Card>
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="font-bold text-turf-900">GHIN connected</div>
            <p className="text-sm text-neutral-600">
              {connection.golferId
                ? `Using GHIN ${connection.golferId}.`
                : "Add your GHIN number below to pull in who you follow."}
            </p>
          </div>
          <Button
            variant="secondary"
            onClick={() => {
              saveToken(null);
              onChange({ token: null, golferId: connection.golferId });
            }}
          >
            Sign out
          </Button>
        </div>

        {connection.golferId ? null : (
          <div className="mt-3 space-y-2">
            <Field
              label="Your GHIN number"
              hint="The endpoints that list who you follow take it in the URL."
            >
              <input
                value={numberDraft}
                onChange={(event) => setNumberDraft(event.target.value)}
                inputMode="numeric"
                className={inputClass}
                placeholder="1234567"
                onKeyDown={(event) => {
                  if (event.key === "Enter") setNumber();
                }}
              />
            </Field>
            {error ? <Banner tone="error">{error}</Banner> : null}
            <Button onClick={setNumber} disabled={!numberDraft.trim()}>
              Use this number
            </Button>
            {shape ? (
              <div className="mt-2">
                <p className="text-xs text-neutral-500">
                  GHIN did not include your number where expected. This is the
                  shape of its sign-in response — field names only, no values:
                </p>
                <pre className="mt-1 max-h-32 overflow-auto whitespace-pre-wrap rounded-lg bg-neutral-900 p-2 text-[0.65rem] text-neutral-100">
                  {shape}
                </pre>
              </div>
            ) : null}
          </div>
        )}
      </Card>
    );
  }

  return (
    <Card>
      <SectionTitle hint="Optional. It saves typing names and handicap indexes — you can enter players by hand instead.">
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
          GHIN has no public API, so this uses the same endpoints the GHIN site
          uses. Your password goes to this app&apos;s own server, is exchanged
          once for a session token, and is never stored. Everything here works
          without it.
        </p>
      </div>
    </Card>
  );
}
