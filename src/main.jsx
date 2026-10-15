import React from 'react';
import { createRoot } from 'react-dom/client';
import JellySliderDemo from './jelly-slider/JellySliderDemo.jsx';

createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <JellySliderDemo />
  </React.StrictMode>
);
