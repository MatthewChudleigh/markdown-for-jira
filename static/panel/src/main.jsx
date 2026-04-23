/* eslint-disable no-unused-vars */
import React from 'react';
import App from './App.jsx';
/* eslint-enable no-unused-vars */
import { createRoot } from 'react-dom/client';
import './styles.css';

createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
