/**
 * 화투 카드 일러스트 (원본 단순화 SVG). viewBox 0 0 60 92 기준 좌표.
 * 상용 화투 그림을 따라 그리지 않고, 달마다 상징물만 단순한 도형으로 표현합니다.
 */
import type { ReactNode } from 'react'
import type { HwatuCard, Month } from './deck'

export const W = 60
export const H = 92

const C = {
  cream: '#f8f0dc',
  redSky: '#d9412e',
  orangeSky: '#ec8a3c',
  ink: '#25221e',
  trunk: '#6b3f1f',
  pine: '#1f5e3a',
  pineHi: '#4c9a62',
  grass: '#86ad5e',
  plum: '#d42c4a',
  pink: '#f39bb6',
  pinkDeep: '#e06b92',
  gold: '#f2bf3a',
  leaf: '#3c8a4a',
  leafDark: '#24603a',
  purple: '#6a4fb0',
  red: '#cc2b2e',
  blue: '#2457a6',
  brown: '#7a4a2a',
}

// ---------- 공용 도형 ----------

function Blossom({ x, y, r, fill, center = C.gold }: { x: number; y: number; r: number; fill: string; center?: string }) {
  const petals = [0, 72, 144, 216, 288].map((a) => {
    const rad = ((a - 90) * Math.PI) / 180
    return <circle key={a} cx={x + Math.cos(rad) * r * 0.62} cy={y + Math.sin(rad) * r * 0.62} r={r * 0.52} fill={fill} />
  })
  return (
    <g>
      {petals}
      <circle cx={x} cy={y} r={r * 0.28} fill={center} />
    </g>
  )
}

function Mum({ x, y, r, fill, center }: { x: number; y: number; r: number; fill: string; center: string }) {
  const petals = Array.from({ length: 12 }, (_, i) => i * 30).map((a) => (
    <ellipse
      key={a}
      cx={x}
      cy={y - r * 0.55}
      rx={r * 0.22}
      ry={r * 0.5}
      fill={fill}
      stroke="rgba(0,0,0,.18)"
      strokeWidth={0.4}
      transform={`rotate(${a} ${x} ${y})`}
    />
  ))
  return (
    <g>
      {petals}
      <circle cx={x} cy={y} r={r * 0.36} fill={center} />
    </g>
  )
}

/** 단풍잎 (5갈래 별 모양) */
function Maple({ x, y, r, fill, rot = 0 }: { x: number; y: number; r: number; fill: string; rot?: number }) {
  const pts: string[] = []
  for (let i = 0; i < 10; i++) {
    const a = ((i * 36 - 90) * Math.PI) / 180
    const rr = i % 2 === 0 ? r : r * 0.45
    pts.push(`${(x + Math.cos(a) * rr).toFixed(2)},${(y + Math.sin(a) * rr).toFixed(2)}`)
  }
  return (
    <g transform={`rotate(${rot} ${x} ${y})`}>
      <polygon points={pts.join(' ')} fill={fill} stroke="rgba(0,0,0,.25)" strokeWidth={0.5} strokeLinejoin="round" />
      <line x1={x} y1={y} x2={x} y2={y + r * 1.1} stroke="#7a2a1a" strokeWidth={0.8} />
    </g>
  )
}

/** 아래로 늘어진 싸리 줄기 + 작은 잎 */
function Bushclover({ color, stem }: { color: string; stem: string }) {
  const strands = [
    { x0: 10, x1: 6, len: 62 },
    { x0: 20, x1: 22, len: 74 },
    { x0: 32, x1: 30, len: 58 },
    { x0: 44, x1: 48, len: 70 },
    { x0: 54, x1: 56, len: 52 },
  ]
  return (
    <g>
      {strands.map((s, i) => {
        const y1 = 3 + s.len
        const cx = (s.x0 + s.x1) / 2 + (i % 2 ? 6 : -6)
        const leaves = []
        for (let t = 0.12; t <= 1; t += 0.11) {
          const bx = (1 - t) * (1 - t) * s.x0 + 2 * (1 - t) * t * cx + t * t * s.x1
          const by = (1 - t) * (1 - t) * 3 + 2 * (1 - t) * t * (3 + s.len / 2) + t * t * y1
          leaves.push(
            <ellipse key={`a${t}`} cx={bx - 2.4} cy={by} rx={2.6} ry={1.3} fill={color} transform={`rotate(-30 ${bx - 2.4} ${by})`} />,
            <ellipse key={`b${t}`} cx={bx + 2.4} cy={by + 1} rx={2.6} ry={1.3} fill={color} transform={`rotate(30 ${bx + 2.4} ${by + 1})`} />,
          )
        }
        return (
          <g key={i}>
            <path d={`M${s.x0} 3 Q ${cx} ${3 + s.len / 2} ${s.x1} ${y1}`} stroke={stem} strokeWidth={0.9} fill="none" />
            {leaves}
          </g>
        )
      })}
    </g>
  )
}

// ---------- 달별 배경 식물 ----------

function PineTree({ small }: { small?: boolean }) {
  const s = small ? 0.75 : 1
  return (
    <g transform={small ? `translate(-2 18) scale(${s})` : undefined}>
      <path d="M3 78 Q 30 66 57 76 V89 H3Z" fill={C.grass} />
      <path d="M16 88 C 20 72, 12 60, 22 46 C 28 38, 26 28, 33 18" stroke={C.trunk} strokeWidth={4.2} fill="none" strokeLinecap="round" />
      <path d="M22 46 C 30 44, 38 40, 46 36" stroke={C.trunk} strokeWidth={2.6} fill="none" strokeLinecap="round" />
      {[
        [14, 30, 11],
        [37, 18, 12],
        [24, 48, 10],
        [46, 36, 10],
        [12, 60, 8],
      ].map(([x, y, rx], i) => (
        <g key={i}>
          <ellipse cx={x} cy={y} rx={rx} ry={rx * 0.5} fill={C.pine} />
          <path
            d={`M${x - rx * 0.7} ${y} q ${rx * 0.35} -3 ${rx * 0.7} 0 q ${rx * 0.35} -3 ${rx * 0.7} 0`}
            stroke={C.pineHi}
            strokeWidth={1}
            fill="none"
          />
        </g>
      ))}
    </g>
  )
}

function PlumBranch() {
  return (
    <g>
      <path d="M4 86 C 16 72, 22 62, 30 52 S 44 32, 56 14" stroke={C.ink} strokeWidth={3.2} fill="none" strokeLinecap="round" />
      <path d="M30 52 C 38 54, 46 60, 54 58" stroke={C.ink} strokeWidth={1.8} fill="none" strokeLinecap="round" />
      <path d="M20 66 C 14 58, 12 50, 8 44" stroke={C.ink} strokeWidth={1.6} fill="none" strokeLinecap="round" />
      {[
        [10, 46, 6],
        [24, 60, 6.5],
        [40, 38, 6],
        [52, 18, 5.5],
        [50, 58, 5.5],
        [14, 78, 5],
        [35, 46, 4],
      ].map(([x, y, r], i) => (
        <Blossom key={i} x={x} y={y} r={r} fill={C.plum} />
      ))}
    </g>
  )
}

function CherryTree({ low }: { low?: boolean }) {
  const pts = low
    ? [
        [10, 12],
        [24, 8],
        [40, 10],
        [52, 18],
        [16, 26],
        [34, 24],
        [48, 32],
        [8, 38],
      ]
    : [
        [10, 14],
        [26, 10],
        [42, 12],
        [52, 26],
        [16, 30],
        [34, 30],
        [48, 44],
        [10, 48],
        [24, 60],
        [40, 66],
        [14, 74],
        [50, 72],
      ]
  return (
    <g>
      {pts.map(([x, y], i) => (
        <Blossom key={i} x={x} y={y} r={7} fill={i % 3 === 0 ? C.pinkDeep : C.pink} center="#fff3c4" />
      ))}
    </g>
  )
}

function Iris() {
  return (
    <g>
      <path d="M3 82 Q 30 76 57 82 V89 H3Z" fill="#7ab3d8" />
      {[
        'M14 86 C 12 60, 8 40, 4 24',
        'M20 86 C 20 64, 24 48, 22 30',
        'M28 86 C 30 66, 36 56, 46 44',
        'M36 86 C 40 70, 48 64, 56 60',
        'M24 86 C 18 70, 12 64, 6 60',
      ].map((d, i) => (
        <path key={i} d={d} stroke={C.leaf} strokeWidth={2.6} fill="none" strokeLinecap="round" />
      ))}
      {[
        [22, 26],
        [46, 40],
        [8, 22],
      ].map(([x, y], i) => (
        <g key={i}>
          <ellipse cx={x - 3} cy={y} rx={2.6} ry={5} fill={C.purple} transform={`rotate(-25 ${x - 3} ${y})`} />
          <ellipse cx={x + 3} cy={y} rx={2.6} ry={5} fill={C.purple} transform={`rotate(25 ${x + 3} ${y})`} />
          <ellipse cx={x} cy={y - 3} rx={2.2} ry={4.5} fill="#8a6fd0" />
          <circle cx={x} cy={y + 1} r={1} fill={C.gold} />
        </g>
      ))}
    </g>
  )
}

function Peony() {
  return (
    <g>
      {[
        [12, 72, -30],
        [48, 70, 30],
        [20, 84, -10],
        [42, 84, 15],
        [30, 56, 0],
      ].map(([x, y, r], i) => (
        <ellipse key={i} cx={x} cy={y} rx={9} ry={5} fill={i % 2 ? C.leafDark : C.leaf} transform={`rotate(${r} ${x} ${y})`} />
      ))}
      <circle cx={30} cy={72} r={14} fill="#a8172a" />
      <circle cx={30} cy={72} r={11} fill={C.red} />
      <circle cx={30} cy={72} r={7.5} fill="#e24a5c" />
      <circle cx={30} cy={72} r={4} fill="#f27b8a" />
      <circle cx={30} cy={72} r={1.6} fill={C.gold} />
    </g>
  )
}

function Chrysanthemum() {
  return (
    <g>
      <path d="M20 88 C 22 74, 24 66, 22 56" stroke={C.leafDark} strokeWidth={2} fill="none" />
      <path d="M34 88 C 36 70, 40 56, 42 42" stroke={C.leafDark} strokeWidth={2} fill="none" />
      {[
        [14, 74, -30],
        [30, 80, 30],
        [46, 62, 20],
        [28, 64, -20],
      ].map(([x, y, r], i) => (
        <ellipse key={i} cx={x} cy={y} rx={6} ry={3.4} fill={C.leaf} transform={`rotate(${r} ${x} ${y})`} />
      ))}
      <Mum x={22} y={52} r={11} fill="#ffffff" center="#e8b52a" />
      <Mum x={42} y={36} r={9} fill={C.gold} center="#c9771a" />
      <Mum x={12} y={22} r={7} fill="#f8d76b" center="#c9771a" />
    </g>
  )
}

function MapleTree() {
  return (
    <g>
      <path d="M2 30 C 18 34, 30 44, 40 58 S 52 80, 58 88" stroke="#5a2e18" strokeWidth={2} fill="none" />
      <path d="M22 38 C 24 26, 30 16, 40 8" stroke="#5a2e18" strokeWidth={1.4} fill="none" />
      {[
        [10, 30, 8, C.red, 10],
        [40, 9, 7, '#e8792d', -20],
        [30, 22, 7.5, C.red, 25],
        [48, 30, 6.5, '#e8792d', 5],
        [40, 56, 8, C.red, -15],
        [16, 52, 6.5, '#e8792d', 20],
        [52, 76, 7, C.red, 10],
        [26, 72, 6, '#b8241f', -30],
      ].map(([x, y, r, f, rot], i) => (
        <Maple key={i} x={x as number} y={y as number} r={r as number} fill={f as string} rot={rot as number} />
      ))}
    </g>
  )
}

function Paulownia({ yellow }: { yellow?: boolean }) {
  return (
    <g>
      {[
        [16, 76, -20],
        [44, 76, 20],
        [30, 68, 0],
      ].map(([x, y, r], i) => (
        <g key={i} transform={`rotate(${r} ${x} ${y})`}>
          <path
            d={`M${x} ${y - 16} C ${x + 14} ${y - 12}, ${x + 14} ${y + 8}, ${x} ${y + 14} C ${x - 14} ${y + 8}, ${x - 14} ${y - 12}, ${x} ${y - 16}Z`}
            fill={yellow ? '#3a3326' : '#1f1f1f'}
          />
          <path d={`M${x} ${y - 14} V ${y + 12}`} stroke={yellow ? '#8c7a3c' : '#4a4a4a'} strokeWidth={0.9} />
        </g>
      ))}
      {[
        [18, 40],
        [30, 34],
        [42, 40],
      ].map(([x, y], i) => (
        <g key={i}>
          <line x1={x} y1={y + 12} x2={x} y2={y - 8} stroke={C.leafDark} strokeWidth={1} />
          {[-6, -2, 2, 6, 10].map((dy) => (
            <circle key={dy} cx={x + (dy % 4 === 0 ? 2 : -2)} cy={y + dy} r={2.2} fill="#9a6cd1" />
          ))}
        </g>
      ))}
    </g>
  )
}

function Willow({ rain = true }: { rain?: boolean }) {
  return (
    <g>
      {rain &&
        Array.from({ length: 11 }, (_, i) => (
          <line key={i} x1={4 + i * 6} y1={4} x2={-8 + i * 6} y2={88} stroke="rgba(70,90,120,.35)" strokeWidth={0.8} />
        ))}
      <path d="M40 3 C 44 20, 46 36, 52 50" stroke="#4d3a22" strokeWidth={2.2} fill="none" />
      {[
        'M42 6 C 34 26, 30 44, 28 64',
        'M44 12 C 40 30, 40 46, 38 60',
        'M48 30 C 54 44, 56 54, 56 66',
        'M46 20 C 52 32, 50 40, 48 52',
      ].map((d, i) => (
        <path key={i} d={d} stroke="#3f9a52" strokeWidth={1.3} fill="none" strokeDasharray="3 1.5" />
      ))}
    </g>
  )
}

// ---------- 열끗·광 그림 ----------

export function Crane() {
  return (
    <g>
      <path d="M36 72 L 34 84 M42 72 L 44 84" stroke={C.ink} strokeWidth={1.2} />
      <ellipse cx={40} cy={66} rx={12} ry={7} fill="#ffffff" stroke={C.ink} strokeWidth={0.8} />
      <path d="M47 62 L 57 66 L 47 70Z" fill={C.ink} />
      <path d="M31 64 C 26 56, 29 46, 34 43" stroke={C.ink} strokeWidth={2.8} fill="none" strokeLinecap="round" />
      <circle cx={34.5} cy={42.5} r={2.6} fill="#ffffff" stroke={C.ink} strokeWidth={0.6} />
      <circle cx={34.5} cy={40.6} r={1.5} fill={C.red} />
      <path d="M36.5 43 L 42 44.5 L 36.5 44.4Z" fill="#c98a2a" />
    </g>
  )
}

export function SongBird() {
  return (
    <g>
      <path d="M42 44 L 52 52 L 46 44Z" fill="#6f7a22" />
      <ellipse cx={36} cy={40} rx={8} ry={5} fill="#b5b532" transform="rotate(20 36 40)" />
      <circle cx={29} cy={35} r={3.6} fill="#c7c63e" />
      <circle cx={28} cy={34.5} r={0.8} fill={C.ink} />
      <path d="M25.6 35 L 22 36.2 L 25.8 36.6Z" fill="#e3913a" />
      <path d="M34 40 C 38 36, 42 38, 44 42" stroke="#7a7a1c" strokeWidth={1} fill="none" />
    </g>
  )
}

export function Curtain() {
  const stripes = Array.from({ length: 8 }, (_, i) => (
    <rect key={i} x={3 + i * 7} y={52} width={7} height={38} fill={i % 2 ? '#f4e2bf' : C.red} />
  ))
  return (
    <g>
      {stripes}
      <path d="M3 52 Q 10 58 17 52 Q 24 58 31 52 Q 38 58 45 52 Q 52 58 57 52 V48 H3Z" fill="#7a1f24" />
      <rect x={3} y={46} width={54} height={3} fill={C.gold} />
      <circle cx={30} cy={66} r={6} fill="#ffffff" stroke="#7a1f24" strokeWidth={1} />
      <Blossom x={30} y={66} r={4.4} fill={C.pinkDeep} />
    </g>
  )
}

export function Cuckoo() {
  return (
    <g>
      <path d="M48 10 a 7 7 0 1 0 6 10 a 5.5 5.5 0 1 1 -6 -10Z" fill={C.gold} />
      <g transform="rotate(-18 30 46)">
        <path d="M22 44 Q 30 26 40 40Z" fill="#3a3a44" />
        <ellipse cx={30} cy={46} rx={11} ry={4.6} fill="#4a4a56" />
        <path d="M40 46 L 50 42 L 48 50Z" fill="#3a3a44" />
        <circle cx={19.5} cy={45} r={3.2} fill="#4a4a56" />
        <circle cx={18.6} cy={44.4} r={0.9} fill={C.red} />
        <path d="M16.6 45.4 L 13 46.4 L 16.8 46.8Z" fill={C.gold} />
        <path d="M24 49 Q 30 52 36 49" stroke="#e8e0d0" strokeWidth={1} fill="none" />
      </g>
    </g>
  )
}

export function Bridge() {
  return (
    <g>
      {[
        [4, 50, 30, 60],
        [26, 62, 56, 70],
      ].map(([x1, y1, x2, y2], i) => (
        <g key={i}>
          <polygon points={`${x1},${y1} ${x2},${y2} ${x2},${y2 + 7} ${x1},${y1 + 7}`} fill="#8a5a2c" stroke="#4a2c12" strokeWidth={0.8} />
          {[0.2, 0.4, 0.6, 0.8].map((t) => (
            <line
              key={t}
              x1={x1 + (x2 - x1) * t}
              y1={y1 + (y2 - y1) * t}
              x2={x1 + (x2 - x1) * t}
              y2={y1 + (y2 - y1) * t + 7}
              stroke="#4a2c12"
              strokeWidth={0.6}
            />
          ))}
          <line x1={x1 + 3} y1={y1 + 7} x2={x1 + 3} y2={y1 + 16} stroke="#4a2c12" strokeWidth={1.4} />
          <line x1={x2 - 3} y1={y2 + 7} x2={x2 - 3} y2={y2 + 16} stroke="#4a2c12" strokeWidth={1.4} />
        </g>
      ))}
    </g>
  )
}

export function Butterfly({ x, y, s, c1, c2 }: { x: number; y: number; s: number; c1: string; c2: string }) {
  return (
    <g transform={`translate(${x} ${y}) scale(${s})`}>
      <ellipse cx={-5} cy={-3} rx={5} ry={4} fill={c1} transform="rotate(-25 -5 -3)" />
      <ellipse cx={5} cy={-3} rx={5} ry={4} fill={c1} transform="rotate(25 5 -3)" />
      <ellipse cx={-4} cy={4} rx={3.4} ry={2.8} fill={c2} />
      <ellipse cx={4} cy={4} rx={3.4} ry={2.8} fill={c2} />
      <rect x={-0.8} y={-6} width={1.6} height={12} rx={0.8} fill={C.ink} />
      <path d="M0 -6 l -3 -4 M0 -6 l 3 -4" stroke={C.ink} strokeWidth={0.6} />
    </g>
  )
}

export function Boar() {
  return (
    <g>
      <ellipse cx={32} cy={64} rx={16} ry={9} fill={C.brown} />
      <path d="M18 60 Q 30 50 46 58" stroke="#4a2a14" strokeWidth={2} fill="none" />
      <ellipse cx={16} cy={66} rx={6} ry={5} fill="#8a5632" />
      <ellipse cx={11} cy={68} rx={2.4} ry={2} fill="#5a341a" />
      <path d="M14 70 q -3 1 -4 -2" stroke="#fffaf0" strokeWidth={1.2} fill="none" />
      <circle cx={16} cy={63.5} r={0.9} fill={C.ink} />
      <path d="M18 59 l 2 -4 l 2 4Z" fill="#5a341a" />
      {[22, 28, 38, 44].map((x) => (
        <rect key={x} x={x - 1.4} y={70} width={2.8} height={8} rx={1} fill="#5a341a" />
      ))}
      <path d="M48 62 q 4 -2 4 -6" stroke="#5a341a" strokeWidth={1.2} fill="none" />
    </g>
  )
}

function Hill({ dark = '#2a2622' }: { dark?: string }) {
  return (
    <g>
      <path d="M3 58 Q 16 40 30 50 T 57 44 V89 H3Z" fill={dark} />
      {Array.from({ length: 9 }, (_, i) => (
        <path
          key={i}
          d={`M${7 + i * 6} 89 Q ${9 + i * 6} ${70 - (i % 3) * 4} ${12 + i * 6} ${58 + (i % 2) * 4}`}
          stroke="rgba(255,255,255,.28)"
          strokeWidth={0.8}
          fill="none"
        />
      ))}
    </g>
  )
}

export function Geese() {
  return (
    <g fill="#2a2622">
      {[
        [16, 16, 1],
        [34, 24, 0.9],
        [46, 12, 0.8],
      ].map(([x, y, s], i) => (
        <g key={i} transform={`translate(${x} ${y}) scale(${s})`}>
          <path d="M-9 -3 Q -4 -6 0 0 Q 4 -6 9 -3 Q 4 -2 0 3 Q -4 -2 -9 -3Z" />
          <circle cx={0} cy={1} r={1.6} />
        </g>
      ))}
    </g>
  )
}

export function Cup() {
  return (
    <g>
      <ellipse cx={30} cy={84} rx={12} ry={2.4} fill="rgba(0,0,0,.18)" />
      <path d="M14 60 H46 Q 44 76 34 78 V82 H26 V78 Q 16 76 14 60Z" fill={C.red} stroke="#7a1418" strokeWidth={0.8} />
      <ellipse cx={30} cy={60} rx={16} ry={3.4} fill="#e23d3f" stroke={C.gold} strokeWidth={1.4} />
      <circle cx={30} cy={69} r={4.2} fill={C.gold} />
      <text x={30} y={71.3} fontSize={5.6} textAnchor="middle" fill="#7a1418" fontWeight={700}>
        壽
      </text>
    </g>
  )
}

export function Deer() {
  return (
    <g>
      <path d="M22 58 l -4 -10 M22 58 l -1 -12 M20 52 l -4 -2 M26 58 l 2 -11 M27 52 l 4 -3" stroke="#5a341a" strokeWidth={1.2} fill="none" />
      <ellipse cx={34} cy={70} rx={13} ry={6.5} fill="#b46a32" />
      <path d="M24 68 Q 22 62 22 59" stroke="#b46a32" strokeWidth={5} strokeLinecap="round" fill="none" />
      <ellipse cx={22} cy={59} rx={4.4} ry={3.2} fill="#c27a3e" />
      <circle cx={20.6} cy={58.4} r={0.8} fill={C.ink} />
      {[28, 34, 40].map((x) => (
        <circle key={x} cx={x} cy={68} r={1} fill="#fff4dc" />
      ))}
      {[25, 30, 39, 44].map((x) => (
        <rect key={x} x={x - 1} y={74} width={2} height={11} rx={1} fill="#8a4e24" />
      ))}
    </g>
  )
}

export function Phoenix() {
  return (
    <g>
      {[
        ['M30 50 C 40 40, 50 30, 56 10', '#2e9c6c'],
        ['M30 52 C 42 46, 52 40, 58 24', '#f2bf3a'],
        ['M30 54 C 44 54, 52 50, 58 40', '#2457a6'],
      ].map(([d, c], i) => (
        <path key={i} d={d} stroke={c} strokeWidth={3.4} fill="none" strokeLinecap="round" />
      ))}
      <ellipse cx={26} cy={56} rx={10} ry={6.5} fill="#2e9c6c" />
      <path d="M18 54 Q 26 40 36 52Z" fill="#f2bf3a" />
      <path d="M18 56 C 14 50, 14 44, 18 40" stroke="#2e9c6c" strokeWidth={3} fill="none" strokeLinecap="round" />
      <circle cx={18.6} cy={38.6} r={3.4} fill={C.red} />
      <path d="M17 35.6 l -2 -4 l 3 2 l 1 -4 l 1.4 4.6Z" fill={C.red} />
      <circle cx={17.6} cy={38} r={0.8} fill={C.ink} />
      <path d="M15.4 39 L 12 40 L 15.6 40.6Z" fill={C.gold} />
    </g>
  )
}

export function UmbrellaMan() {
  return (
    <g>
      <path d="M3 80 Q 20 74 40 80 T 57 78 V89 H3Z" fill="#5b8fbf" />
      <path d="M8 26 Q 22 6 40 22Z" fill={C.red} />
      <path d="M8 26 Q 16 18 24 16 M24 16 Q 32 16 40 22 M24 16 L 22 26" stroke={C.gold} strokeWidth={0.9} fill="none" />
      <line x1={23} y1={16} x2={26} y2={56} stroke="#4a2c12" strokeWidth={1.2} />
      <circle cx={30} cy={34} r={4} fill="#f0c9a0" />
      <path d="M26 31 Q 30 26 34 31Z" fill={C.ink} />
      <path d="M22 70 L 26 40 Q 30 37 34 40 L 40 70Z" fill="#26324a" />
      <path d="M26 46 L 22 54" stroke="#f0c9a0" strokeWidth={2} strokeLinecap="round" />
      <path d="M26 72 L 26 78 M36 72 L 36 78" stroke={C.ink} strokeWidth={2} />
      <ellipse cx={48} cy={77} rx={3} ry={2} fill="#4c9a62" />
    </g>
  )
}

export function Swallow() {
  return (
    <g transform="rotate(-12 30 48)">
      <path d="M24 46 Q 30 30 44 34 Q 34 40 30 48Z" fill="#1c2a4a" />
      <path d="M24 50 Q 30 64 44 66 Q 34 56 30 50Z" fill="#1c2a4a" />
      <ellipse cx={26} cy={48} rx={9} ry={4} fill="#22335a" />
      <path d="M34 48 L 50 42 L 42 48 L 50 54Z" fill="#1c2a4a" />
      <circle cx={18} cy={47} r={3.2} fill="#22335a" />
      <path d="M16 49.4 Q 18 52 21 50" fill={C.red} />
      <circle cx={17.2} cy={46.4} r={0.7} fill="#fff" />
      <path d="M15 47.4 L 12 48 L 15 48.6Z" fill={C.ink} />
      <ellipse cx={24} cy={50.4} rx={4} ry={1.4} fill="#f4ecdc" />
    </g>
  )
}

function Storm() {
  return (
    <g>
      <rect x={0} y={0} width={W} height={H} fill="#d9d4c6" />
      <path d="M3 30 Q 8 16 20 20 Q 26 8 38 14 Q 50 8 57 20 V3 H3Z" fill="#2a2622" />
      <ellipse cx={30} cy={24} rx={24} ry={9} fill="#2a2622" />
      <polygon points="30,30 22,52 30,50 24,74 40,44 32,46 38,30" fill={C.gold} stroke="#b07a10" strokeWidth={0.6} />
      {[12, 48].map((x) => (
        <g key={x}>
          <circle cx={x} cy={72} r={6} fill={C.red} stroke="#7a1418" strokeWidth={1} />
          <circle cx={x} cy={72} r={2.4} fill="#f4e2bf" />
        </g>
      ))}
      <Willow />
    </g>
  )
}

// ---------- 띠 ----------

export function Ribbon({ type }: { type: 'hong' | 'cheong' | 'cho' | 'plain' }) {
  const fill = type === 'cheong' ? C.blue : C.red
  const text = type === 'hong' ? ['홍', '단'] : type === 'cheong' ? ['청', '단'] : null
  return (
    <g transform="rotate(-8 30 40)">
      <path d="M19 16 H41 L 39 64 L 34 60 L 30 66 L 26 60 L 21 64Z" fill={fill} stroke="rgba(0,0,0,.35)" strokeWidth={0.8} />
      <path d="M21 20 H39" stroke="rgba(255,255,255,.45)" strokeWidth={0.8} />
      {text && (
        <g fontWeight={800} fontSize={9.5} textAnchor="middle" fill={type === 'hong' ? '#1c1a18' : '#ffffff'}>
          <text x={30} y={34}>
            {text[0]}
          </text>
          <text x={30} y={46}>
            {text[1]}
          </text>
        </g>
      )}
      {type === 'plain' && <path d="M24 26 H36 M24 30 H36" stroke="#7a1418" strokeWidth={0.8} />}
    </g>
  )
}

// ---------- 카드 한 장의 그림 ----------

function background(card: HwatuCard): string {
  if (card.kind === 'gwang') return card.month === 11 ? '#f0e3c4' : C.cream
  if (card.month === 11 && card.piValue === 2) return '#f3d76a'
  return C.cream
}

function sky(card: HwatuCard): ReactNode {
  const m = card.month
  if (card.kind === 'gwang' && (m === 1 || m === 8 || m === 11)) {
    return <rect x={0} y={0} width={W} height={60} fill={C.redSky} />
  }
  if (card.kind === 'yeol' && m === 8) return <rect x={0} y={0} width={W} height={60} fill={C.orangeSky} />
  if (m === 8 && card.kind === 'pi') return <rect x={0} y={0} width={W} height={60} fill={card.slot === 2 ? '#f2d6b0' : '#efc79a'} />
  return null
}

function plant(month: Month, card: HwatuCard): ReactNode {
  switch (month) {
    case 1:
      return <PineTree small={card.kind === 'gwang'} />
    case 2:
      return <PlumBranch />
    case 3:
      return <CherryTree low={card.kind === 'gwang'} />
    case 4:
      return <Bushclover color="#2a2433" stem="#4a3f52" />
    case 5:
      return <Iris />
    case 6:
      return <Peony />
    case 7:
      return <Bushclover color="#c4303a" stem="#6a7a3a" />
    case 8:
      return <Hill />
    case 9:
      return <Chrysanthemum />
    case 10:
      return <MapleTree />
    case 11:
      return <Paulownia yellow={card.piValue === 2} />
    case 12:
      return card.piValue === 2 ? null : <Willow rain={card.kind !== 'yeol'} />
  }
}

function feature(card: HwatuCard): ReactNode {
  const m = card.month
  if (card.kind === 'gwang') {
    switch (m) {
      case 1:
        return (
          <>
            <circle cx={42} cy={20} r={10} fill={C.gold} />
            <circle cx={42} cy={20} r={7} fill="#f8d76b" />
            <Crane />
          </>
        )
      case 3:
        return <Curtain />
      case 8:
        return <circle cx={34} cy={28} r={15} fill="#fbf3dc" stroke="#f2bf3a" strokeWidth={1.2} />
      case 11:
        return <Phoenix />
      case 12:
        return <UmbrellaMan />
    }
  }
  if (card.kind === 'yeol') {
    switch (m) {
      case 2:
        return <SongBird />
      case 4:
        return <Cuckoo />
      case 5:
        return <Bridge />
      case 6:
        return (
          <>
            <Butterfly x={16} y={18} s={1.1} c1="#f2bf3a" c2="#e8792d" />
            <Butterfly x={42} y={30} s={0.9} c1="#5aa0d8" c2="#2457a6" />
          </>
        )
      case 7:
        return <Boar />
      case 8:
        return <Geese />
      case 9:
        return <Cup />
      case 10:
        return <Deer />
      case 12:
        return <Swallow />
    }
  }
  if (card.kind === 'tti') return <Ribbon type={card.ribbon!} />
  if (m === 12 && card.piValue === 2) return <Storm />
  return null
}

/** 카드 앞면 그림 (테두리·배지 제외). */
export function CardArt({ card }: { card: HwatuCard }) {
  // 같은 달의 두 번째 피는 좌우 반전해 조금 다르게 보이게 함
  const mirror = card.kind === 'pi' && card.slot === 3 && card.piValue === 1
  const isStorm = card.month === 12 && card.piValue === 2
  return (
    <g>
      <rect x={0} y={0} width={W} height={H} fill={background(card)} />
      {sky(card)}
      {!isStorm && <g transform={mirror ? `translate(${W} 0) scale(-1 1)` : undefined}>{plant(card.month, card)}</g>}
      {feature(card)}
    </g>
  )
}
