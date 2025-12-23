import React from 'react';
import templateSvg from '../assets/card-template.svg?raw';
import { getTierLabel, normalizeTier, tierColors, type Tier } from '../utils/tier';

type CardTemplateSVGProps = {
  numbers: [number | null, number | null, number | null, number | null];
  tier: Tier;
  size?: number;
};

const svgMatch = templateSvg.match(/<[^>]*svg[^>]*>([\s\S]*?)<\/[^>]*svg>/);
const templateInner = svgMatch ? svgMatch[1] : templateSvg;
const viewBoxMatch = templateSvg.match(/viewBox="([^"]+)"/);
const viewBox = viewBoxMatch ? viewBoxMatch[1] : '0 0 100 100';

const viewBoxParts = viewBox.split(/[\s,]+/).map((value) => Number(value));
const vbWidth = Number.isFinite(viewBoxParts[2]) ? viewBoxParts[2] : 100;
const vbHeight = Number.isFinite(viewBoxParts[3]) ? viewBoxParts[3] : 100;

const centerX = vbWidth / 2;
const centerY = vbHeight / 2;
const unit = vbWidth / 5;
const spokeLength = 2 * unit;
const numberRadius = 0.7 * spokeLength;
const fontSize = 1.32 * unit;

const numberPositions = [
  { x: centerX, y: centerY - numberRadius, rotate: 0 },
  { x: centerX + numberRadius, y: centerY, rotate: 90 },
  { x: centerX, y: centerY + numberRadius, rotate: 180 },
  { x: centerX - numberRadius, y: centerY, rotate: 270 }
] as const;

const dotRadius = unit * 0.09;
const dotGap = unit * 0.22;
const dotEdge = unit * 2.3;
const dotStart = unit * 1.8;
const markerWidth = spokeLength * 0.091;
const markerHeight = spokeLength * 0.135;
const markerOffset = fontSize * 0.223;

function renderTierDots(tier: Tier) {
  const dots: Array<{ cx: number; cy: number; key: string }> = [];
  for (let j = 0; j < tier; j += 1) {
    const offset = dotStart - dotGap * j;
    const positions = [
      { x: offset, y: dotEdge, key: `top-${j}` },
      { x: -dotEdge, y: offset, key: `left-${j}` },
      { x: -offset, y: -dotEdge, key: `bottom-${j}` },
      { x: dotEdge, y: -offset, key: `right-${j}` }
    ];
    for (const pos of positions) {
      dots.push({
        cx: centerX + pos.x,
        cy: centerY - pos.y,
        key: pos.key
      });
    }
  }
  return (
    <g>
      {dots.map((dot) => (
        <circle key={dot.key} cx={dot.cx} cy={dot.cy} r={dotRadius} fill={tierColors[tier]} />
      ))}
    </g>
  );
}

function renderNumberMarkers(numbers: [number | null, number | null, number | null, number | null]) {
  const markers: Array<{ cx: number; cy: number; rx: number; ry: number; key: string }> = [];
  numbers.forEach((value, index) => {
    if (value !== 9) {
      return;
    }
    const position = numberPositions[index];
    const angle = (position.rotate * Math.PI) / 180;
    const dx = Math.sin(angle) * markerOffset;
    const dy = -Math.cos(angle) * markerOffset;
    const cx = position.x + dx;
    const cy = position.y + dy;
    const vertical = position.rotate % 180 === 0;
    markers.push({
      cx,
      cy,
      rx: vertical ? markerWidth : markerHeight,
      ry: vertical ? markerHeight : markerWidth,
      key: `marker-${index}`
    });
  });
  if (markers.length === 0) {
    return null;
  }
  return (
    <g>
      {markers.map((marker) => (
        <ellipse
          key={marker.key}
          cx={marker.cx}
          cy={marker.cy}
          rx={marker.rx}
          ry={marker.ry}
          fill="#FF0000"
        />
      ))}
    </g>
  );
}

export default function CardTemplateSVG({ numbers, tier, size = 360 }: CardTemplateSVGProps) {
  const normalizedTier = normalizeTier(tier, 'CardTemplateSVG');
  const hasHidden = numbers.some((value) => value === null);
  const ariaLabel = hasHidden
    ? '24 Arena card'
    : `24 Arena card with numbers ${numbers.filter((value): value is number => value !== null).join(', ')}`;

  return (
    <svg
      width={size}
      height={size}
      viewBox={viewBox}
      preserveAspectRatio="xMidYMid meet"
      role="img"
      aria-label={ariaLabel}
    >
      <g dangerouslySetInnerHTML={{ __html: templateInner }} />
      {renderTierDots(normalizedTier)}
      {renderNumberMarkers(numbers)}
      <g
        fontFamily="'Computer Modern Roman', 'CMU Serif', 'Latin Modern Roman', 'Computer Modern Serif', 'Times New Roman', serif"
        fontSize={fontSize}
        fontWeight={400}
        fill="#101010"
      >
        {numbers.map((value, index) => {
          const position = numberPositions[index];
          return (
            <text
              key={`${value ?? 'hidden'}-${index}`}
              x={position.x}
              y={position.y}
              textAnchor="middle"
              dominantBaseline="middle"
              transform={`rotate(${position.rotate} ${position.x} ${position.y})`}
            >
              {value ?? '?'}
            </text>
          );
        })}
      </g>
      <title>{getTierLabel(normalizedTier)}</title>
    </svg>
  );
}
