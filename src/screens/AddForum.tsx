import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Button } from '../components/Button';
import { Field } from '../components/Field';
import { Header } from '../components/Header';
import { Spinner } from '../components/Spinner';
import { addForum } from '../db/db';
import { makeProbeClient } from '../forum/connection';
import { setActiveForumId } from '../lib/activeForum';
import { t } from '../lib/i18n';
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
      setError(t('add.configureRelay'));
      return;
    }
    const candidates = mobiquoCandidates(url);
    if (candidates.length === 0) {
      setError(t('add.invalidUrl'));
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

        setStatus(t('add.probing'));
        let configName = '';
        let logoUrl: string | undefined;
        try {
          const config = await client.getConfig();
          configName = config.name;
          logoUrl = config.logoUrl;
        } catch {
          lastError = t('add.noEndpoint');
          continue; // try the next candidate
        }

        setStatus(t('add.signingIn'));
        const result = await client.login(username, password);
        if (!result.success) {
          // Right endpoint, wrong credentials — stop and report.
          setError(result.error || t('add.loginFailed'));
          return;
        }

        setStatus(t('add.saving'));
        const secrets = await encryptSecrets({ password });
        const id = await addForum({
          name: name.trim() || configName || t('common.forum'),
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
      setError(lastError || t('add.couldNotConnect'));
    } catch (err) {
      setError(err instanceof Error ? err.message : t('add.couldNotConnectShort'));
    } finally {
      setBusy(false);
      setStatus('');
    }
  };

  return (
    <div>
      <Header title={t('add.title')} back />
      <div className="mx-auto max-w-4xl p-4 space-y-4">
        <form
          className="space-y-4"
          onSubmit={(e) => {
            e.preventDefault();
            submit();
          }}
        >
          <Field
            label={t('add.url')}
            placeholder="https://forum.example.com"
            hint={t('add.urlHint')}
            inputMode="url"
            autoCapitalize="none"
            value={url}
            onChange={(e) => setUrl(e.target.value)}
          />
          <Field
            label={t('add.username')}
            autoCapitalize="none"
            autoComplete="username"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
          />
          <Field
            label={t('add.password')}
            type="password"
            autoComplete="current-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
          <Field
            label={t('add.displayName')}
            placeholder={t('add.displayNamePlaceholder')}
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
                <Spinner /> {status || t('add.connecting')}
              </>
            ) : (
              t('add.connect')
            )}
          </Button>
          <p className="text-xs text-ink-dim text-center">{t('add.privacyNote')}</p>
        </form>
      </div>
    </div>
  );
}
