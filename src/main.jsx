import React from 'react';
import { createRoot } from 'react-dom/client';
import App from './App.jsx';
import LobeProvider from './LobeProvider.jsx';
import './styles.css';

document.documentElement.dataset.platform = navigator.platform.startsWith('Win')
  ? 'windows'
  : navigator.platform.startsWith('Mac') ? 'macos' : 'other';

createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <LobeProvider><App /></LobeProvider>
  </React.StrictMode>,
);
