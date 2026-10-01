import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App.js';
import './styles/global.css';
import './styles/gamenight.css';
import { applySkin } from './skin.js';
import { applyCardNaming } from './cardNames.js';

const root = document.getElementById('root');
if (!root) throw new Error('missing #root');
applySkin();
applyCardNaming();

createRoot(root).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
