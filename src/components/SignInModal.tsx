import React, { useState, useCallback, FormEvent } from "react";
import esriId from "@arcgis/core/identity/IdentityManager";
import esriConfig from "@arcgis/core/config";

interface SignInModalProps {
  serverUrl: string;
  onSignIn: () => void;
}

function getServerRoot(url: string): string {
  const match = url.match(/^(https?:\/\/[^/]+(?:\/[^/]+)*?)\/rest\/services/i);
  if (match) return match[1];
  try {
    return new URL(url).origin;
  } catch {
    return url;
  }
}

async function fetchToken(
  tokenUrl: string,
  username: string,
  password: string
): Promise<{ token: string; expires?: number } | null> {
  try {
    const resp = await fetch(tokenUrl, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        username,
        password,
        client: "requestip",
        expiration: "60",
        f: "json",
      }).toString(),
    });
    if (!resp.ok) return null;
    const data = (await resp.json()) as { token?: string; expires?: number };
    return data.token ? { token: data.token, expires: data.expires } : null;
  } catch {
    return null;
  }
}

const SignInModal: React.FC<SignInModalProps> = ({ serverUrl, onSignIn }) => {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = useCallback(
    async (e: FormEvent<HTMLFormElement>) => {
      e.preventDefault();
      setError(null);
      setLoading(true);

      try {
        const serverRoot = getServerRoot(serverUrl);
        const ssl = serverUrl.startsWith("https");

        // Step 1: Get server token
        const serverTokenUrl = `${serverRoot}/tokens/generateToken`;
        const serverResult = await fetchToken(serverTokenUrl, username, password);

        if (!serverResult) {
          setError("Authentication failed — verify credentials and try again.");
          return;
        }

        const { token: serverToken, expires: serverExpires } = serverResult;
        const baseExpires = serverExpires ?? Date.now() + 60 * 60 * 1000;

        // Step 2: Attach token via request interceptor
        esriConfig.request.interceptors.push({
          urls: serverRoot,
          before(params) {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const opts = params.requestOptions as any;
            opts.query = opts.query ?? {};
            opts.query.token = serverToken;
          },
        });

        // Register with IdentityManager as fallback
        esriId.registerToken({
          server: serverRoot,
          token: serverToken,
          userId: username,
          ssl,
          expires: baseExpires,
        });

        // Step 3: Pre-register portal token
        const portalRoot = serverRoot.replace(/\/server\/?$/, "/portal");
        if (portalRoot !== serverRoot) {
          const portalResult = await fetchToken(
            `${portalRoot}/sharing/rest/generateToken`,
            username,
            password
          );
          if (portalResult) {
            esriId.registerToken({
              server: portalRoot,
              token: portalResult.token,
              userId: username,
              ssl,
              expires: portalResult.expires ?? baseExpires,
            });
          }
        }

        onSignIn();
      } catch (err: unknown) {
        console.error("[SignIn] caught error:", err);
        const message =
          (err as { message?: string })?.message ?? "Sign-in failed. Please try again.";
        setError(message);
      } finally {
        setLoading(false);
      }
    },
    [username, password, serverUrl, onSignIn]
  );

  return (
    <div className="modal-backdrop">
      <div className="modal-container" role="dialog" aria-modal="true" aria-labelledby="signin-title">
        <div className="modal-header">
          <h2 id="signin-title">Sign In</h2>
          <p className="modal-subtitle">Columbus LRS — ArcGIS Server</p>
        </div>

        <form className="modal-form" onSubmit={handleSubmit} autoComplete="on" noValidate>
          <div className="form-field">
            <label htmlFor="username">Username</label>
            <input
              id="username"
              type="text"
              name="username"
              autoComplete="username"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              placeholder="Enter your username"
              disabled={loading}
              required
            />
          </div>

          <div className="form-field">
            <label htmlFor="password">Password</label>
            <input
              id="password"
              type="password"
              name="password"
              autoComplete="current-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Enter your password"
              disabled={loading}
              required
            />
          </div>

          {error && (
            <div className="form-error" role="alert">
              {error}
            </div>
          )}

          <button
            type="submit"
            className="btn-primary"
            disabled={loading || !username || !password}
          >
            {loading ? "Signing in..." : "Sign In"}
          </button>
        </form>
      </div>
    </div>
  );
};

export default SignInModal;
