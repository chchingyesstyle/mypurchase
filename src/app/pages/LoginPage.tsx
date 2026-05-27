import { FormEvent, useState } from 'react';
import { LockKeyhole } from 'lucide-react';
import { ApiError } from '../api/client';
import { Button } from '../components/Button';
import { useAuth } from '../state/auth';

export function LoginPage() {
  const { login } = useAuth();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSubmitting(true);
    setError(null);

    try {
      await login(username, password);
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.message : 'Unable to sign in');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <main className="login-page">
      <section className="login-panel" aria-labelledby="login-heading">
        <div>
          <p className="eyebrow">MyPurchase</p>
          <h1 id="login-heading">Sign in</h1>
          <p className="login-copy">Access receipts, records, reports, and budget controls.</p>
        </div>
        <form className="login-form" onSubmit={handleSubmit}>
          <label>
            <span>Username</span>
            <input
              aria-describedby={error ? 'login-error' : undefined}
              autoComplete="username"
              name="username"
              onChange={(event) => setUsername(event.target.value)}
              required
              value={username}
            />
          </label>
          <label>
            <span>Password</span>
            <input
              aria-describedby={error ? 'login-error' : undefined}
              autoComplete="current-password"
              name="password"
              onChange={(event) => setPassword(event.target.value)}
              required
              type="password"
              value={password}
            />
          </label>
          {error ? (
            <p aria-live="polite" className="form-error" id="login-error" role="alert">
              {error}
            </p>
          ) : null}
          <Button disabled={submitting} icon={<LockKeyhole size={16} />} type="submit" variant="primary">
            {submitting ? 'Signing in' : 'Sign in'}
          </Button>
        </form>
      </section>
    </main>
  );
}
