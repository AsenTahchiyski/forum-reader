import { useState } from 'react';
import { useLocation, useNavigate, useParams } from 'react-router-dom';
import { Button } from '../components/Button';
import { Field, TextArea } from '../components/Field';
import { Header } from '../components/Header';
import { Spinner } from '../components/Spinner';
import { getClient } from '../forum/connection';

export function Compose() {
  const navigate = useNavigate();
  const accountId = Number(useParams().forumId);
  const prefill = (useLocation().state as { to?: string } | null) ?? {};

  const [to, setTo] = useState(prefill.to ?? '');
  const [subject, setSubject] = useState('');
  const [body, setBody] = useState('');
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const send = async () => {
    setError(null);
    const recipients = to
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean);
    if (recipients.length === 0) {
      setError('Add at least one recipient.');
      return;
    }
    if (!body.trim()) {
      setError('Write a message first.');
      return;
    }
    setSending(true);
    try {
      const client = await getClient(accountId);
      const res = await client.sendMessage(recipients, subject || '(no subject)', body);
      if (!res.ok) throw new Error(res.message || 'The forum rejected the message.');
      navigate(`/f/${accountId}/pm`, { replace: true });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not send.');
    } finally {
      setSending(false);
    }
  };

  return (
    <div>
      <Header title="New message" back />
      <div className="mx-auto max-w-2xl p-4">
        <form
          className="space-y-4"
          onSubmit={(e) => {
            e.preventDefault();
            send();
          }}
        >
          <Field
            label="To"
            placeholder="username, anotheruser"
            hint="Separate multiple recipients with commas."
            autoCapitalize="none"
            value={to}
            onChange={(e) => setTo(e.target.value)}
          />
          <Field
            label="Subject"
            value={subject}
            onChange={(e) => setSubject(e.target.value)}
          />
          <TextArea
            label="Message"
            className="min-h-40"
            value={body}
            onChange={(e) => setBody(e.target.value)}
          />
          {error && <p className="text-sm text-[rgb(255,107,107)]">{error}</p>}
          <Button full size="lg" type="submit" disabled={sending}>
            {sending ? <Spinner /> : 'Send message'}
          </Button>
        </form>
      </div>
    </div>
  );
}
