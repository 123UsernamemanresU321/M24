import React from 'react';
import CardTemplateSVG from '../components/CardTemplateSVG';
import cardTemplateUrl from '../assets/card-template.svg?url';

const samples: Array<{ numbers: [number, number, number, number]; tier: 1 | 2 | 3 | 4 }> = [
  { numbers: [1, 1, 1, 1], tier: 1 },
  { numbers: [1, 2, 3, 4], tier: 2 },
  { numbers: [3, 4, 6, 7], tier: 3 },
  { numbers: [5, 7, 8, 9], tier: 4 }
];

export default function CardDebug() {
  return (
    <div className="container">
      <div className="panel">
        <div className="section-title">Card Template Debug</div>
        <p className="helper">
          Reference PDF: <code>Cards Source/cards.pdf</code>
        </p>
        <p className="helper">
          Template should be blank (no numbers or dots). Dots are rendered dynamically by the app.
        </p>

        <div className="grid" style={{ gap: '24px', marginTop: '16px' }}>
          <div className="panel" style={{ background: '#fff' }}>
            <div className="section-title">Template Only</div>
            <img src={cardTemplateUrl} alt="Card template" style={{ width: '280px', maxWidth: '100%' }} />
          </div>

          <div className="panel" style={{ background: '#fff' }}>
            <div className="section-title">Sample Cards</div>
            <div className="grid grid-2">
              {samples.map((sample, index) => (
                <CardTemplateSVG
                  key={`${sample.numbers.join('-')}-${index}`}
                  numbers={sample.numbers}
                  tier={sample.tier}
                  size={240}
                />
              ))}
            </div>
            <p className="helper" style={{ marginTop: '10px' }}>
              1 yellow dot per side = easy. 2 orange-yellow dots per side = moderate. 3 orange-red dots per side = challenging.
              4 red dots per side = hard. 5 dots are reserved for impossible and are not used.
            </p>
          </div>
        </div>

        <p className="helper" style={{ marginTop: '12px' }}>
          If the overlay alignment looks off, adjust positions in <code>client/src/components/CardTemplateSVG.tsx</code>.
        </p>
      </div>
    </div>
  );
}
