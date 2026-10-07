/**
 * "쉬운 보기" 카드 앞면. viewBox 0 0 60 92 (art.tsx와 같은 크기).
 * - 위: 달마다 다른 색 띠 + 큰 달 숫자 (+ 넓을 땐 짧은 이름)
 * - 가운데: 굵고 단순한 달 그림 (열끗·광은 동물/물건을 크게)
 * - 아래: 종류 칩 (광 / 열끗 / 홍단·청단·초단·띠 / 피 / 쌍피)
 * 아주 작을 때(mini)는 달 숫자 + 종류 색만 보여 줌.
 */
import type { ReactNode } from 'react'
import { Boar, Bridge, Butterfly, Crane, Cup, Cuckoo, Curtain, Deer, Geese, H, Phoenix, SongBird, Swallow, UmbrellaMan, W } from './art'
import { MONTH_NAMES, type HwatuCard } from './deck'

export type Tier = 'mini' | 'small' | 'full'

export function tierOf(width: number): Tier {
  return width < 36 ? 'mini' : width < 50 ? 'small' : 'full'
}

/** 달 색 [띠 색, 띠 위 글자색, 그림 바탕(연한 색)] — index = month */
export const MONTH_COLORS: readonly (readonly [string, string, string])[] = [
  ['#888', '#fff', '#eee'],
  ['#2f8a3a', '#ffffff', '#e5f2e2'], // 1 송학: 초록
  ['#d32f2f', '#ffffff', '#fbe6e3'], // 2 매조: 빨강
  ['#f59ac0', '#4a0b27', '#fdecf3'], // 3 벚꽃: 분홍
  ['#2b2b31', '#ffffff', '#e8e8ec'], // 4 흑싸리: 검정
  ['#7a4fc9', '#ffffff', '#efe8fa'], // 5 난초: 보라
  ['#1e63c0', '#ffffff', '#e3edf9'], // 6 모란: 파랑
  ['#00838f', '#ffffff', '#ddf1f2'], // 7 홍싸리: 청록
  ['#b9c0cc', '#1b2230', '#f1f2f5'], // 8 공산: 은색
  ['#f4c20d', '#3a2a00', '#fdf6da'], // 9 국화: 노랑
  ['#e8620c', '#ffffff', '#fde9db'], // 10 단풍: 주황
  ['#6d4c41', '#ffffff', '#f1e9e5'], // 11 오동: 갈색
  ['#7cc4ef', '#0b2a40', '#e7f5fd'], // 12 비: 하늘색
]

export interface KindStyle {
  /** 칩에 쓸 글자 (넓을 때) */
  label: string
  /** 좁을 때 / 미니 카드 글자 */
  short: string
  bg: string
  fg: string
  shape: 'gwang' | 'yeol' | 'tti' | 'pi' | 'ssang'
}

export function kindStyle(c: HwatuCard): KindStyle {
  if (c.kind === 'gwang') return { label: c.isBiGwang ? '비광' : '광', short: '광', bg: '#f5b800', fg: '#4a1800', shape: 'gwang' }
  if (c.kind === 'yeol') return { label: c.isGukjin ? '열끗' : '열끗', short: '열', bg: '#37474f', fg: '#ffffff', shape: 'yeol' }
  if (c.kind === 'tti') {
    switch (c.ribbon) {
      case 'hong':
        return { label: '홍단', short: '홍', bg: '#d32f2f', fg: '#ffffff', shape: 'tti' }
      case 'cheong':
        return { label: '청단', short: '청', bg: '#1e5fbf', fg: '#ffffff', shape: 'tti' }
      case 'cho':
        return { label: '초단', short: '초', bg: '#3f8f3a', fg: '#ffffff', shape: 'tti' }
      default:
        return { label: '띠', short: '띠', bg: '#9b7b6e', fg: '#ffffff', shape: 'tti' }
    }
  }
  if (c.piValue === 2) return { label: '쌍피', short: '쌍', bg: '#1d1b19', fg: '#ffd54a', shape: 'ssang' }
  return { label: '피', short: '피', bg: '#e6e0d3', fg: '#4a4236', shape: 'pi' }
}

// ---------- 굵은 달 그림 (0 0 54 50 좌표) ----------

function Flower5({ x, y, r, fill, center = '#ffd54a', stroke = 'rgba(255,255,255,.9)' }: { x: number; y: number; r: number; fill: string; center?: string; stroke?: string }) {
  return (
    <g>
      {[0, 72, 144, 216, 288].map((a) => {
        const rad = ((a - 90) * Math.PI) / 180
        return <circle key={a} cx={x + Math.cos(rad) * r * 0.58} cy={y + Math.sin(rad) * r * 0.58} r={r * 0.5} fill={fill} stroke={stroke} strokeWidth={0.7} />
      })}
      <circle cx={x} cy={y} r={r * 0.27} fill={center} />
    </g>
  )
}

function MapleLeaf({ x, y, r, fill, rot = 0 }: { x: number; y: number; r: number; fill: string; rot?: number }) {
  const pts: string[] = []
  for (let i = 0; i < 10; i++) {
    const a = ((i * 36 - 90) * Math.PI) / 180
    const rr = i % 2 === 0 ? r : r * 0.48
    pts.push(`${(x + Math.cos(a) * rr).toFixed(2)},${(y + Math.sin(a) * rr).toFixed(2)}`)
  }
  return (
    <g transform={`rotate(${rot} ${x} ${y})`}>
      <polygon points={pts.join(' ')} fill={fill} stroke="#7a1d0d" strokeWidth={0.9} strokeLinejoin="round" />
      <line x1={x} y1={y} x2={x} y2={y + r * 1.15} stroke="#7a1d0d" strokeWidth={1.2} />
    </g>
  )
}

function Clover({ leaf, stem, flower }: { leaf: string; stem: string; flower?: string }) {
  const strands = [
    { x0: 6, x1: 4, len: 46, bend: -5 },
    { x0: 18, x1: 20, len: 50, bend: 6 },
    { x0: 31, x1: 30, len: 44, bend: -6 },
    { x0: 44, x1: 48, len: 48, bend: 6 },
  ]
  return (
    <g>
      {strands.map((s, i) => {
        const cx = (s.x0 + s.x1) / 2 + s.bend
        const els: ReactNode[] = []
        for (let k = 0; k < 6; k++) {
          const t = 0.1 + k * 0.16
          const bx = (1 - t) * (1 - t) * s.x0 + 2 * (1 - t) * t * cx + t * t * s.x1
          const by = 2 * (1 - t) * t * (s.len / 2) + t * t * s.len
          els.push(
            <ellipse key={`a${k}`} cx={bx - 3.2} cy={by} rx={3.6} ry={1.9} fill={leaf} transform={`rotate(-28 ${bx - 3.2} ${by})`} />,
            <ellipse key={`b${k}`} cx={bx + 3.2} cy={by + 1.2} rx={3.6} ry={1.9} fill={leaf} transform={`rotate(28 ${bx + 3.2} ${by + 1.2})`} />,
          )
          if (flower && k % 2 === 1) els.push(<circle key={`f${k}`} cx={bx} cy={by + 3} r={1.7} fill={flower} />)
        }
        return (
          <g key={i}>
            <path d={`M${s.x0} 0 Q ${cx} ${s.len / 2} ${s.x1} ${s.len}`} stroke={stem} strokeWidth={1.5} fill="none" />
            {els}
          </g>
        )
      })}
    </g>
  )
}

function Emblem({ month, variant }: { month: number; variant: number }): ReactNode {
  switch (month) {
    case 1:
      return (
        <g>
          <path d="M0 50 V44 Q 27 36 54 44 V50Z" fill="#7fb35a" />
          <path d="M22 50 C 25 40, 17 32, 26 22 C 30 17, 30 10, 34 5" stroke="#6b3f1f" strokeWidth={5} fill="none" strokeLinecap="round" />
          <path d="M26 24 C 33 22, 39 20, 45 15" stroke="#6b3f1f" strokeWidth={3.2} fill="none" strokeLinecap="round" />
          {[
            [13, 15, 12],
            [35, 7, 12],
            [44, 18, 10],
            [15, 31, 10],
            [36, 30, 9],
          ].map(([x, y, rx], i) => (
            <g key={i}>
              <ellipse cx={x} cy={y} rx={rx} ry={rx * 0.48} fill="#17552f" />
              <path d={`M${x - rx * 0.75} ${y} q ${rx * 0.375} -3.6 ${rx * 0.75} 0 q ${rx * 0.375} -3.6 ${rx * 0.75} 0`} stroke="#5cb370" strokeWidth={1.6} fill="none" />
            </g>
          ))}
        </g>
      )
    case 2:
      return (
        <g>
          <path d="M2 50 C 12 40, 18 32, 26 25 S 40 12, 52 2" stroke="#2a1d17" strokeWidth={4} fill="none" strokeLinecap="round" />
          <path d="M26 25 C 34 28, 42 34, 50 34" stroke="#2a1d17" strokeWidth={2.4} fill="none" strokeLinecap="round" />
          <Flower5 x={12} y={36} r={9} fill="#d81b3c" />
          <Flower5 x={29} y={18} r={9.5} fill="#d81b3c" />
          <Flower5 x={45} y={7} r={7.5} fill="#d81b3c" />
          <Flower5 x={44} y={36} r={8} fill="#d81b3c" />
        </g>
      )
    case 3:
      return (
        <g>
          {[
            [11, 11, 10, 0],
            [30, 8, 10, 1],
            [46, 15, 9, 0],
            [19, 27, 10, 1],
            [38, 30, 10, 0],
            [9, 42, 8.5, 0],
            [27, 43, 8.5, 1],
            [46, 44, 8, 1],
          ].map(([x, y, r, d], i) => (
            <Flower5 key={i} x={x} y={y} r={r} fill={d ? '#e2558a' : '#f7a1c1'} center="#fff1b8" />
          ))}
        </g>
      )
    case 4:
      return <Clover leaf="#1d1c22" stem="#4a4552" />
    case 5:
      return (
        <g>
          <path d="M0 50 V45 Q 27 41 54 45 V50Z" fill="#79b6dd" />
          {['M12 50 C 10 34, 6 24, 3 14', 'M20 50 C 20 36, 24 26, 22 16', 'M29 50 C 31 38, 37 30, 46 22', 'M36 50 C 40 42, 46 38, 52 36', 'M24 50 C 18 42, 12 38, 6 36'].map((d, i) => (
            <path key={i} d={d} stroke="#2f7d3a" strokeWidth={3.2} fill="none" strokeLinecap="round" />
          ))}
          {[
            [22, 13, 1.1],
            [44, 20, 1],
            [7, 14, 0.9],
          ].map(([x, y, s], i) => (
            <g key={i} transform={`translate(${x} ${y}) scale(${s})`}>
              <ellipse cx={-3.6} cy={1} rx={3.4} ry={6.4} fill="#5b37a8" transform="rotate(-28 -3.6 1)" />
              <ellipse cx={3.6} cy={1} rx={3.4} ry={6.4} fill="#5b37a8" transform="rotate(28 3.6 1)" />
              <ellipse cx={0} cy={-3} rx={2.8} ry={5.8} fill="#8a64dd" />
              <circle cx={0} cy={2} r={1.3} fill="#ffd54a" />
            </g>
          ))}
        </g>
      )
    case 6:
      return (
        <g>
          {[
            [8, 38, -30],
            [46, 38, 30],
            [16, 47, -8],
            [38, 47, 12],
          ].map(([x, y, r], i) => (
            <ellipse key={i} cx={x} cy={y} rx={11} ry={5.6} fill={i % 2 ? '#1f5e34' : '#2f8a45'} transform={`rotate(${r} ${x} ${y})`} />
          ))}
          <circle cx={27} cy={25} r={18} fill="#9c0f26" />
          <circle cx={27} cy={25} r={14} fill="#d42a40" />
          <circle cx={27} cy={25} r={9.5} fill="#ec5a6c" />
          <circle cx={27} cy={25} r={5} fill="#f88d99" />
          <circle cx={27} cy={25} r={2} fill="#ffd54a" />
        </g>
      )
    case 7:
      return <Clover leaf="#d0283a" stem="#5e7a2a" flower="#ff8fa0" />
    case 8:
      return (
        <g>
          <path d="M0 26 Q 12 12 26 20 T 54 16 V50 H0Z" fill="#1f1c19" />
          {Array.from({ length: 8 }, (_, i) => (
            <path
              key={i}
              d={`M${3 + i * 7} 50 Q ${5 + i * 7} ${38 - (i % 3) * 4} ${8 + i * 7} ${26 + ((i + variant) % 2) * 4}`}
              stroke="rgba(255,255,255,.45)"
              strokeWidth={1.2}
              fill="none"
            />
          ))}
        </g>
      )
    case 9:
      return (
        <g>
          <path d="M16 50 C 18 42, 18 36, 14 30 M34 50 C 34 40, 32 32, 30 24" stroke="#24603a" strokeWidth={2.6} fill="none" />
          {[
            [8, 44, -30],
            [26, 46, 30],
            [44, 40, 20],
          ].map(([x, y, r], i) => (
            <ellipse key={i} cx={x} cy={y} rx={8} ry={4} fill="#3c8a4a" transform={`rotate(${r} ${x} ${y})`} />
          ))}
          <Mum x={31} y={20} r={16} fill="#f6c21c" center="#c9771a" />
          <Mum x={11} y={29} r={10} fill="#ffffff" center="#e8b52a" />
        </g>
      )
    case 10:
      return (
        <g>
          <path d="M0 8 C 14 12, 26 22, 34 32 S 46 46, 54 50" stroke="#5a2e18" strokeWidth={2.6} fill="none" />
          <MapleLeaf x={13} y={14} r={12} fill="#e02a1e" rot={10} />
          <MapleLeaf x={40} y={14} r={11} fill="#f07a14" rot={-20} />
          <MapleLeaf x={27} y={33} r={12} fill="#e8461a" rot={25} />
          <MapleLeaf x={46} y={40} r={9} fill="#c81e16" rot={-5} />
        </g>
      )
    case 11:
      return (
        <g>
          {[
            [12, 38, -24],
            [42, 38, 24],
            [27, 34, 0],
          ].map(([x, y, r], i) => (
            <g key={i} transform={`rotate(${r} ${x} ${y})`}>
              <path d={`M${x} ${y - 16} C ${x + 15} ${y - 12}, ${x + 15} ${y + 8}, ${x} ${y + 15} C ${x - 15} ${y + 8}, ${x - 15} ${y - 12}, ${x} ${y - 16}Z`} fill="#1b1b1b" />
              <path d={`M${x} ${y - 13} V ${y + 13}`} stroke="#555" strokeWidth={1} />
            </g>
          ))}
          {[
            [14, 6],
            [27, 3],
            [40, 6],
          ].map(([x, y], i) => (
            <g key={i}>
              <line x1={x} y1={y + 14} x2={x} y2={y - 2} stroke="#24603a" strokeWidth={1.4} />
              {[0, 4, 8, 12].map((dy) => (
                <circle key={dy} cx={x + (dy % 8 === 0 ? 2 : -2)} cy={y + dy} r={2.8} fill="#8c5fd6" />
              ))}
            </g>
          ))}
        </g>
      )
    case 12:
      return (
        <g>
          {Array.from({ length: 9 }, (_, i) => (
            <line key={i} x1={4 + i * 7} y1={0} x2={-6 + i * 7} y2={50} stroke="rgba(40,80,130,.38)" strokeWidth={1.1} />
          ))}
          <path d="M36 0 C 40 14, 42 26, 48 36" stroke="#4d3a22" strokeWidth={3} fill="none" />
          {['M38 2 C 30 18, 26 32, 24 46', 'M40 6 C 36 20, 36 32, 34 44', 'M44 20 C 50 30, 52 38, 52 48', 'M42 12 C 48 22, 46 30, 44 40'].map((d, i) => (
            <path key={i} d={d} stroke="#2f9a4a" strokeWidth={2.4} fill="none" strokeDasharray="4 2" />
          ))}
        </g>
      )
  }
  return null
}

function Mum({ x, y, r, fill, center }: { x: number; y: number; r: number; fill: string; center: string }) {
  return (
    <g>
      {Array.from({ length: 12 }, (_, i) => i * 30).map((a) => (
        <ellipse key={a} cx={x} cy={y - r * 0.55} rx={r * 0.22} ry={r * 0.5} fill={fill} stroke="rgba(0,0,0,.25)" strokeWidth={0.5} transform={`rotate(${a} ${x} ${y})`} />
      ))}
      <circle cx={x} cy={y} r={r * 0.34} fill={center} />
    </g>
  )
}

/** 띠 (0 0 54 50 좌표) */
function EasyRibbon({ color }: { color: string }) {
  return (
    <g transform="rotate(-10 27 25)">
      <path d="M18 1 H36 L 35 47 L 30.5 43 L 27 48 L 23.5 43 L 19 47Z" fill={color} stroke="rgba(0,0,0,.45)" strokeWidth={1} />
      <path d="M20 5 H34" stroke="rgba(255,255,255,.6)" strokeWidth={1.2} />
      <path d="M20 9 H34" stroke="rgba(255,255,255,.35)" strokeWidth={0.8} />
    </g>
  )
}

/** 주인공 그림(art.tsx 좌표) + 그 부분을 잘라 보여줄 viewBox */
function featureOf(c: HwatuCard): { vb: string; el: ReactNode } | null {
  const m = c.month
  if (c.kind === 'gwang') {
    switch (m) {
      case 1:
        return {
          vb: '8 28 52 60',
          el: (
            <>
              <circle cx={22} cy={45} r={11} fill="#e8402e" />
              <Crane />
            </>
          ),
        }
      case 3:
        return { vb: '0 40 60 52', el: <Curtain /> }
      case 11:
        return { vb: '8 6 52 60', el: <Phoenix /> }
      case 12:
        return { vb: '0 2 60 88', el: <UmbrellaMan /> }
    }
  }
  if (c.kind === 'yeol') {
    switch (m) {
      case 2:
        return { vb: '16 26 40 32', el: <SongBird /> }
      case 4:
        return { vb: '10 0 48 58', el: <Cuckoo /> }
      case 5:
        return { vb: '0 46 60 44', el: <Bridge /> }
      case 6:
        return {
          vb: '2 4 54 40',
          el: (
            <>
              <Butterfly x={16} y={18} s={1.25} c1="#f2bf3a" c2="#e8792d" />
              <Butterfly x={42} y={30} s={1.05} c1="#5aa0d8" c2="#2457a6" />
            </>
          ),
        }
      case 7:
        return { vb: '6 48 50 34', el: <Boar /> }
      case 9:
        return { vb: '10 54 40 34', el: <Cup /> }
      case 10:
        return { vb: '12 42 40 46', el: <Deer /> }
      case 12:
        return { vb: '8 26 46 44', el: <Swallow /> }
    }
  }
  return null
}

function ArtBox({ card, y, h, uid }: { card: HwatuCard; y: number; h: number; uid: string }) {
  const [, , tint] = MONTH_COLORS[card.month]
  const m = card.month
  const mirror = card.kind === 'pi' && card.slot === 3 && card.piValue === 1
  const feat = featureOf(card)
  const storm = m === 12 && card.piValue === 2
  let bg = tint
  if (card.kind === 'gwang') bg = '#fff3c4'
  if (m === 8 && card.kind === 'yeol') bg = '#ffd8a8'
  const box = (children: ReactNode, vb = '0 0 54 50') => (
    <svg x={3} y={y} width={54} height={h} viewBox={vb} preserveAspectRatio="xMidYMid meet" overflow="hidden">
      {children}
    </svg>
  )
  let content: ReactNode
  if (storm) {
    content = box(
      <g>
        <rect x={0} y={0} width={54} height={50} fill="#cfd6de" />
        <ellipse cx={27} cy={6} rx={30} ry={11} fill="#2a2622" />
        <polygon points="29,8 19,28 28,26 21,48 39,20 30,22 37,8" fill="#ffc91a" stroke="#9a6a00" strokeWidth={0.8} />
        {[8, 46].map((x) => (
          <g key={x}>
            <circle cx={x} cy={38} r={6.5} fill="#d32f2f" stroke="#6a1010" strokeWidth={1} />
            <circle cx={x} cy={38} r={2.6} fill="#fbe9c8" />
          </g>
        ))}
      </g>,
    )
  } else if (m === 8 && card.kind === 'gwang') {
    content = box(
      <g>
        <rect x={0} y={0} width={54} height={50} fill="#e8402e" />
        <circle cx={27} cy={18} r={14} fill="#fff6d8" stroke="#ffc91a" strokeWidth={2} />
        <g transform="translate(0 14) scale(1 .72)">
          <Emblem month={8} variant={0} />
        </g>
      </g>,
    )
  } else if (m === 8 && card.kind === 'yeol') {
    content = (
      <>
        {box(<Emblem month={8} variant={1} />)}
        {box(<Geese />, '4 2 54 34')}
      </>
    )
  } else if (feat) {
    content = (
      <>
        {box(
          <g opacity={card.kind === 'gwang' ? 0.3 : 0.42}>
            <Emblem month={m} variant={0} />
          </g>,
        )}
        {card.kind === 'gwang' && box(<circle cx={27} cy={25} r={24} fill={`url(#hwg${uid})`} />)}
        {box(feat.el, feat.vb)}
      </>
    )
  } else if (card.kind === 'tti') {
    const color = card.ribbon === 'cheong' ? '#1e5fbf' : '#d32f2f'
    content = (
      <>
        {box(
          <g opacity={0.85}>
            <Emblem month={m} variant={0} />
          </g>,
        )}
        {box(<EasyRibbon color={color} />)}
      </>
    )
  } else {
    content = box(
      <g transform={mirror ? 'translate(54 0) scale(-1 1)' : undefined}>
        <Emblem month={m} variant={card.slot} />
      </g>,
    )
  }
  return (
    <g>
      <rect x={3} y={y} width={54} height={h} fill={bg} />
      {content}
    </g>
  )
}

/** 종류 칩 (아래쪽) */
function KindChip({ card, y, h, full }: { card: HwatuCard; y: number; h: number; full: boolean }) {
  const k = kindStyle(card)
  const text = full ? k.label : k.label.length > 2 ? k.short : k.label
  const fs = full ? 11 : 13.5
  const cy = y + h / 2
  const icon = full && (k.shape === 'gwang' || k.shape === 'yeol')
  const tx = icon ? 34 : 30
  let shape: ReactNode
  const x0 = 5
  const x1 = 55
  if (k.shape === 'tti') {
    // 리본 모양 (양 끝이 V자로 파임)
    shape = <path d={`M${x0} ${y} H${x1} L${x1 - 4} ${cy} L${x1} ${y + h} H${x0} L${x0 + 4} ${cy}Z`} fill={k.bg} stroke="rgba(0,0,0,.35)" strokeWidth={0.8} />
  } else if (k.shape === 'pi') {
    shape = <rect x={x0 + 6} y={y + 1} width={x1 - x0 - 12} height={h - 2} rx={(h - 2) / 2} fill={k.bg} stroke="#a59c8a" strokeWidth={0.8} />
  } else if (k.shape === 'ssang') {
    shape = (
      <>
        <rect x={x0} y={y} width={x1 - x0} height={h} rx={3} fill={k.bg} />
        <rect x={x0 + 1.6} y={y + 1.6} width={x1 - x0 - 3.2} height={h - 3.2} rx={2} fill="none" stroke="#ffd54a" strokeWidth={0.9} />
      </>
    )
  } else if (k.shape === 'gwang') {
    shape = <rect x={x0} y={y} width={x1 - x0} height={h} rx={3} fill={k.bg} stroke="#9a6a00" strokeWidth={0.9} />
  } else {
    shape = <rect x={x0} y={y} width={x1 - x0} height={h} rx={h / 2} fill={k.bg} />
  }
  return (
    <g>
      {shape}
      {icon && k.shape === 'gwang' && (
        <g>
          <circle cx={15} cy={cy} r={6} fill="#fff8e1" stroke="#c62828" strokeWidth={1.3} />
          <text x={15} y={cy + 3} fontSize={8} fontWeight={900} textAnchor="middle" fill="#c62828">
            光
          </text>
        </g>
      )}
      {icon && k.shape === 'yeol' && (card.isGodori ? <BirdIcon x={15} y={cy} /> : <PawIcon x={15} y={cy} />)}
      <text x={tx} y={cy + fs * 0.36} fontSize={fs} fontWeight={900} textAnchor="middle" fill={k.fg} letterSpacing={k.label.length > 1 ? -0.3 : 0}>
        {text}
      </text>
    </g>
  )
}

function PawIcon({ x, y }: { x: number; y: number }) {
  return (
    <g fill="#ffffff">
      <ellipse cx={x} cy={y + 1.8} rx={2.8} ry={2.3} />
      <circle cx={x - 3.2} cy={y - 1.2} r={1.25} />
      <circle cx={x - 1.1} cy={y - 3} r={1.25} />
      <circle cx={x + 1.1} cy={y - 3} r={1.25} />
      <circle cx={x + 3.2} cy={y - 1.2} r={1.25} />
    </g>
  )
}

function BirdIcon({ x, y }: { x: number; y: number }) {
  return (
    <g fill="#ffd54a" transform={`translate(${x} ${y})`}>
      <path d="M-6 -1 Q -3 -4 0 0 Q 3 -4 6 -1 Q 3 0 0 4 Q -3 0 -6 -1Z" />
    </g>
  )
}

/** 쉬운 보기 앞면 전체 (테두리 포함) */
export function EasyFace({ card, tier, uid }: { card: HwatuCard; tier: Tier; uid: string }) {
  const [band, bandText] = MONTH_COLORS[card.month]
  const k = kindStyle(card)
  const gold = card.kind === 'gwang'
  const frame = gold ? '#c99700' : '#3a3328'
  if (tier === 'mini') {
    return (
      <g>
        <rect x={gold ? 1.5 : 0.7} y={gold ? 1.5 : 0.7} width={W - (gold ? 3 : 1.4)} height={H - (gold ? 3 : 1.4)} rx={5.5} fill={band} stroke={frame} strokeWidth={gold ? 3 : 1.4} />
        <text x={5} y={44} fontSize={card.month >= 10 ? 36 : 44} fontWeight={900} fill={bandText} letterSpacing={-3}>
          {card.month}
        </text>
        <rect x={4} y={56} width={W - 8} height={H - 60} rx={5} fill={k.bg} stroke={k.shape === 'pi' ? '#a59c8a' : 'rgba(0,0,0,.3)'} strokeWidth={1} />
        {k.shape === 'ssang' && <rect x={7} y={59} width={W - 14} height={H - 66} rx={3} fill="none" stroke="#ffd54a" strokeWidth={1.4} />}
        <text x={8} y={83} fontSize={25} fontWeight={900} fill={k.fg}>
          {k.short}
        </text>
      </g>
    )
  }
  const full = tier === 'full'
  const bandH = full ? 21 : 25
  const chipH = full ? 15 : 17
  const chipY = H - 3 - chipH
  const artY = bandH + 1
  const artH = chipY - 2 - artY
  return (
    <g>
      <defs>
        <radialGradient id={`hwg${uid}`}>
          <stop offset="0%" stopColor="#ffd54a" stopOpacity={0.9} />
          <stop offset="100%" stopColor="#ffd54a" stopOpacity={0} />
        </radialGradient>
        <clipPath id={`hwe${uid}`}>
          <rect x={1} y={1} width={W - 2} height={H - 2} rx={5} />
        </clipPath>
      </defs>
      <rect x={0.5} y={0.5} width={W - 1} height={H - 1} rx={6} fill="#fffdf8" />
      <g clipPath={`url(#hwe${uid})`}>
        <rect x={0} y={0} width={W} height={bandH} fill={band} />
        {full ? (
          <>
            <text x={4} y={16.5} fontSize={card.month >= 10 ? 16 : 18} fontWeight={900} fill={bandText} letterSpacing={-1}>
              {card.month}
            </text>
            <text x={W - 4} y={14.6} fontSize={card.month >= 10 ? 9 : 10} fontWeight={800} textAnchor="end" fill={bandText}>
              {MONTH_NAMES[card.month]}
            </text>
          </>
        ) : (
          <text x={W / 2} y={21} fontSize={23} fontWeight={900} textAnchor="middle" fill={bandText} letterSpacing={-1.5}>
            {card.month}
          </text>
        )}
        <ArtBox card={card} y={artY} h={artH} uid={uid} />
        {card.isGukjin && full && (
          <g>
            <rect x={W - 21} y={artY + 2} width={17} height={10} rx={2.5} fill="#fff" stroke="#37474f" strokeWidth={0.8} strokeDasharray="2 1" />
            <text x={W - 12.5} y={artY + 9.6} fontSize={7} fontWeight={900} textAnchor="middle" fill="#37474f">
              쌍피
            </text>
          </g>
        )}
        <KindChip card={card} y={chipY} h={chipH} full={full} />
      </g>
      <rect x={gold ? 1.5 : 0.6} y={gold ? 1.5 : 0.6} width={W - (gold ? 3 : 1.2)} height={H - (gold ? 3 : 1.2)} rx={gold ? 5 : 6} fill="none" stroke={frame} strokeWidth={gold ? 3 : 1.2} />
      {gold && <rect x={3.4} y={3.4} width={W - 6.8} height={H - 6.8} rx={3.6} fill="none" stroke="#ffe27a" strokeWidth={0.8} opacity={0.9} />}
    </g>
  )
}
