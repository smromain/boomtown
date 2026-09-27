import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App.js';
import './styles/global.css';
import './styles/gamenight.css';
import { applySkin } from './skin.js';

const root = document.getElementById('root');
if (!root) throw new Error('missing #root');
applySkin();

createRoot(root).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
