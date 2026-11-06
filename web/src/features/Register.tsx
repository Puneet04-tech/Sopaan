import { useState } from "preact/hooks";
import { register } from "../data/auth";
import { navigate } from "../state";

export function Register() {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [email, setEmail] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const onSubmit = async (e: Event) => {
    e.preventDefault();
    setLoading(true);
    setError("");
    try {
      await register(username, password, email, displayName);
      navigate("/");
      window.location.reload();
    } catch (err: any) {
      const code = typeof err === "string" ? err : err?.message || "";
      if (code === "register_failed_bad_server_url") {
        setError("Cannot reach the server. Check that the app is running and sopaan_server_url is correct.");
      } else if (code === "register_failed_409") {
        setError("Username already exists.");
      } else {
        setError("Registration failed. Username may exist.");
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <div class="screen" style="padding-top:60px">
      <div class="card">
        <h1>Create Account</h1>
        <p class="muted mt-1">Join Sopaan as a real student</p>
        <form class="stack mt-3" onSubmit={onSubmit}>
          <label class="stack">
            <span class="label">Username</span>
            <input class="input" value={username} onInput={(e: any) => setUsername(e.target.value)} />
          </label>
          <label class="stack">
            <span class="label">Display Name</span>
            <input class="input" value={displayName} onInput={(e: any) => setDisplayName(e.target.value)} />
          </label>
          <label class="stack">
            <span class="label">Email (optional)</span>
            <input class="input" value={email} onInput={(e: any) => setEmail(e.target.value)} />
          </label>
          <label class="stack">
            <span class="label">Password</span>
            <input class="input" type="password" value={password} onInput={(e: any) => setPassword(e.target.value)} />
          </label>
          {error && <p class="text-bad">{error}</p>}
          <button class="btn saffron" type="submit" disabled={loading}>{loading ? "Creating..." : "Register"}</button>
        </form>
        <div class="mt-3">
          <a href="#/login" class="muted">Already have an account? Login</a>
        </div>
      </div>
    </div>
  );
}
