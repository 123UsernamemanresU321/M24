import React from 'react';
import CardTemplateSVG from './CardTemplateSVG';
import { getTierLabel } from '../utils/tier';

export default function CardView({
  numbers,
  tier
}: {
  numbers: Array<number | null>;
  tier: 1 | 2 | 3 | 4;
}) {
  return (
    <div className="card-art fade-up">
      <CardTemplateSVG numbers={[
        numbers[0] ?? null,
        numbers[1] ?? null,
        numbers[2] ?? null,
        numbers[3] ?? null
      ]} tier={tier} size={320} />
      <div className="card-tier-label">{getTierLabel(tier)}</div>
    </div>
  );
}
