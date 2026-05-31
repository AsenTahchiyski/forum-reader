import React from 'react';
import ReactDOM from 'react-dom/client';
import { App } from './App';
import { ensureSettings, requestPersistentStorage } from './db/db';
import { applyAccent, applyThemeMode } from './theme/ThemeProvider';
import './index.css';

async function bootstrap() {
  // Mark our storage durable so the browser won't evict the encrypted vault.
  await requestPersistentStorage();

  const settings = await ensureSettings();
  // Apply theme synchronously to avoid a flash before React mounts.
  applyAccent(settings.accentColor);
  applyThemeMode(settings.themeMode);

  ReactDOM.createRoot(document.getElementById('root')!).render(
    <React.StrictMode>
      <App />
    </React.StrictMode>
  );
}

bootstrap();
