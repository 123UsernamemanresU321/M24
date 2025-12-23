import React, { useEffect, useState } from 'react';
import QRCode from 'qrcode';

export default function QrCode({ value, size = 160, label }: { value: string; size?: number; label?: string }) {
  const [dataUrl, setDataUrl] = useState<string>('');

  useEffect(() => {
    let cancelled = false;
    QRCode.toDataURL(value, { margin: 1, width: size })
      .then((url) => {
        if (!cancelled) {
          setDataUrl(url);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setDataUrl('');
        }
      });
    return () => {
      cancelled = true;
    };
  }, [value, size]);

  if (!dataUrl) {
    return <div className="qr-placeholder" style={{ width: size, height: size }} />;
  }

  return <img src={dataUrl} width={size} height={size} alt={label ?? 'Join QR code'} />;
}
