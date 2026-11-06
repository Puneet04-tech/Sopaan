import { useState } from "preact/hooks";
import { login } from "../data/auth";
import { navigate } from "../state";

export function Login() {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const onSubmit = async (e: Event) => {
    e.preventDefault();
    setLoading(true);
    setError("");
    try {
      await login(username, password);
      navigate("/");
      window.location.reload();
    } catch (err: any) {
      const code = typeof err === "string" ? err : err?.message || "";
      if (code === "login_failed_bad_server_url") {
        setError("Cannot reach the server. Check that the app is running and sopaan_server_url is correct.");
      } else {
        setError("Login failed. Check credentials.");
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <div class="screen" style="padding-top:60px">
      <div class="card">
        <h1>Login</h1>
        <p class="muted mt-1">Sign in to access your Sopaan account</p>
        <form class="stack mt-3" onSubmit={onSubmit}>
          <label class="stack">
            <span class="label">Username</span>
            <input class="input" value={username} onInput={(e: any) => setUsername(e.target.value)} />
          </label>
          <label class="stack">
            <span class="label">Password</span>
            <input class="input" type="password" value={password} onInput={(e: any) => setPassword(e.target.value)} />
          </label>
          {error && <p class="text-bad">{error}</p>}
          <button class="btn saffron" type="submit" disabled={loading}>{loading ? "Signing in..." : "Login"}</button>
        </form>
        <div class="mt-3">
          <a href="#/register" class="muted">Don't have an account? Register</a>
        </div>
      </div>
    </div>
  );
}
