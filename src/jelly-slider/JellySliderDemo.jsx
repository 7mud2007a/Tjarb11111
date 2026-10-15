'use client';

import { useState } from 'react';
import JellySlider from './JellySlider.jsx';

export default function JellySliderDemo() {
  const [value, setValue] = useState(48);

  return (
    <main style={{ minHeight: '100vh', maxWidth: 720, margin: '0 auto', background: '#111', color: '#fff', fontFamily: 'system-ui, sans-serif' }}>
      <header style={{ padding: '22px 16px 12px', textAlign: 'center', background: '#000' }}>
        <h1 style={{ margin: 0, fontSize: 30, lineHeight: 1.2, fontWeight: 600 }}>
          <span style={{ display: 'block', color: '#ffad45' }}>Jelly Slider</span>
          Animation
        </h1>
        <p style={{ margin: '10px 0 0', color: '#c9c9c9', fontSize: 14 }}>Drag the jelly or use the slider below.</p>
      </header>

      <section style={{ background: 'linear-gradient(135deg, #f0f0f4, #b8b8bf)', color: '#222', padding: '8px 16px 20px' }}>
        <JellySlider
          value={value}
          onChange={setValue}
          label="Jelly slider"
          style={{ display: 'block', width: '100%', maxWidth: 620, margin: '0 auto' }}
        />
      </section>

      <section style={{ padding: '22px 24px 32px', background: '#181818' }}>
        <label htmlFor="backup-slider" style={{ display: 'flex', justifyContent: 'space-between', gap: 12, marginBottom: 12, fontSize: 16 }}>
          <span>Backup slider</span>
          <strong>{Math.round(value)}%</strong>
        </label>
        <input
          id="backup-slider"
          type="range"
          min="0"
          max="100"
          value={value}
          onChange={(event) => setValue(Number(event.target.value))}
          style={{ display: 'block', width: '100%', accentColor: '#ff9d32', cursor: 'pointer' }}
        />
        <p style={{ margin: '12px 0 0', color: '#bdbdbd', fontSize: 13, lineHeight: 1.5 }}>
          If the 3D animation is not supported by this browser, this control should still work.
        </p>
      </section>
    </main>
  );
}
