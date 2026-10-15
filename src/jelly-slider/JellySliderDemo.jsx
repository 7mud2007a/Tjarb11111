'use client';

import { useState } from 'react';
import JellySlider from './JellySlider.jsx';

// Matches the video: black title strip, jelly slider on the light backdrop.
export default function JellySliderDemo() {
  const [value, setValue] = useState(48);

  return (
    <div style={{ maxWidth: 720, margin: '0 auto', background: '#000' }}>
      <h1
        style={{
          margin: 0,
          padding: '20px 0 12px',
          textAlign: 'center',
          fontFamily: "'Oswald', 'Arial Narrow', sans-serif",
          fontWeight: 500,
          fontSize: 28,
          lineHeight: 1.1,
          color: '#fff',
        }}
      >
        <span style={{ display: 'block', color: '#f0a020' }}>Jelly Slider</span>
        Animation
      </h1>
      <JellySlider value={value} onChange={setValue} label="Jelly slider" />
    </div>
  );
}
