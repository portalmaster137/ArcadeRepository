import { useEffect, useRef } from 'react';

// Simple QR code via API (no library needed for display)
export default function QRCode({ value, size = 180 }) {
  const src = `https://api.qrserver.com/v1/create-qr-code/?size=${size}x${size}&data=${encodeURIComponent(value)}&bgcolor=050510&color=00f5ff&qzone=2&format=png`;

  return (
    <div style={{
      display: 'inline-flex',
      padding: '12px',
      background: 'rgba(0,245,255,0.06)',
      border: '1px solid rgba(0,245,255,0.3)',
      borderRadius: '8px',
    }}>
      <img
        src={src}
        alt={`QR code for ${value}`}
        width={size}
        height={size}
        style={{ display: 'block', imageRendering: 'pixelated' }}
      />
    </div>
  );
}
