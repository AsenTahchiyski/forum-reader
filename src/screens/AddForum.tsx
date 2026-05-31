import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Button } from '../components/Button';
import { Field } from '../components/Field';
import { Header } from '../components/Header';
import { Spinner } from '../components/Spinner';
import { addForum } from '../db/db';
import { makeProbeClient } from '../forum/connection';
import { setActiveForumId } from '../lib/activeForum';
import { mobiquoCandidates, normalizeBaseUrl } from '../lib/url';
import { encryptSecrets } from '../lib/vault';
import { useSettings } from '../hooks/useSettings';

export function AddForum() {
  const navigate = useNavigate();
  const settings = useSettings();

  const [url, setUrl] = useState('');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [name, setName] = useState('');
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState('');
  const [error, setError] = useState<string | null>(null);

  const canSubmit = !!url && !!username && !!password && !busy;

  const submit = async () => {
    setError(null);
    if (!settings?.proxyBaseUrl) {
      setError('Configure your relay URL in Settings before adding a forum.');
      return;
    }
    const candidates = mobiquoCandidates(url);
    if (candidates.length === 0) {
      setError('Enter a valid forum URL.');
      return;
    }

    setBusy(true);
    let lastError: string | null = null;
    try {
      for (const mobiquoUrl of candidates) {
        const client = makeProbeClient(
          settings.proxyBaseUrl,
          settings.relayToken,
          mobiquoUrl
        );

        setStatus('Looking for the Tapatalk plugin…');
        let configName = '';
        let logoUrl: string | undefined;
        try {
          const config = await client.getConfig();
          configName = config.name;
          logoUrl = config.logoUrl;
        } catch {
          lastError =
            'No Tapatalk endpoint responded there. This forum may not have the plugin installed.';
          continue; // try the next candidate
        }

        setStatus('Signing in…');
        const result = await client.login(username, password);
        if (!result.success) {
          // Right endpoint, wrong credentials — stop and report.
          setError(result.error || 'Login failed. Check your username and password.');
          return;
        }

        setStatus('Saving…');
        const secrets = await encryptSecrets({ password });
        const id = await addForum({
          name: name.trim() || configName || 'Forum',
          baseUrl: normalizeBaseUrl(url),
          mobiquoUrl,
          username,
          secrets,
          avatarUrl: logoUrl
        });
        setActiveForumId(id);
        navigate(`/f/${id}`, { replace: true });
        return;
      }
      setError(lastError || 'Could not connect to that forum.');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not connect.');
    } finally {
      setBusy(false);
      setStatus('');
    }
  };

  return (
    <div>
      <Header title="Add forum" back />
      <div className="mx-auto max-w-2xl p-4 space-y-4">
        <form
          className="space-y-4"
          onSubmit={(e) => {
            e.preventDefault();
            submit();
          }}
        >
          <Field
            label="Forum URL"
            placeholder="https://forum.example.com"
            hint="The board's web address. We'll look for /mobiquo/mobiquo.php."
            inputMode="url"
            autoCapitalize="none"
            value={url}
            onChange={(e) => setUrl(e.target.value)}
          />
          <Field
            label="Username"
            autoCapitalize="none"
            autoComplete="username"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
          />
          <Field
            label="Password"
            type="password"
            autoComplete="current-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
          <Field
            label="Display name (optional)"
            placeholder="Leave blank to use the forum's name"
            value={name}
            onChange={(e) => setName(e.target.value)}
          />

          {error && (
            <div className="rounded-xl border border-[rgb(255_107_107/0.3)] bg-[rgb(255_107_107/0.1)] p-3 text-sm text-[rgb(255,107,107)]">
              {error}
            </div>
          )}

          <Button full size="lg" type="submit" disabled={!canSubmit}>
            {busy ? (
              <>
                <Spinner /> {status || 'Connecting…'}
              </>
            ) : (
              'Connect & save'
            )}
          </Button>
          <p className="text-xs text-ink-dim text-center">
            Your password is encrypted on this device and only sent to your own
            forum through your own relay.
          </p>
        </form>
      </div>
    </div>
  );
}
