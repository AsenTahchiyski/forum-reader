import { Button } from './Button';

interface Props {
  message: string;
  onRetry?: () => void;
}

export function ErrorBanner({ message, onRetry }: Props) {
  return (
    <div className="m-4 rounded-xl border border-[rgb(255_107_107/0.3)] bg-[rgb(255_107_107/0.1)] p-4">
      <p className="text-sm text-[rgb(255,107,107)]">{message}</p>
      {onRetry && (
        <Button variant="outline" size="sm" className="mt-3" onClick={onRetry}>
          Try again
        </Button>
      )}
    </div>
  );
}
