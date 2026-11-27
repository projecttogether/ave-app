import type { InternalRadarProps } from 'recharts'

/** Recharts gives null values center coordinates, so its default polygon plots them as zero. */
export function AvailableRadarShape({ points = [], stroke, strokeWidth, strokeDasharray, fill, fillOpacity }: Pick<InternalRadarProps, 'points' | 'stroke' | 'strokeWidth' | 'strokeDasharray' | 'fill' | 'fillOpacity'>) {
  const available = points.map(point => point.value != null && Number.isFinite(point.value))
  const complete = available.every(Boolean)
  // Start after a gap so consecutive points spanning the last/first axis stay connected.
  const start = complete ? 0 : available.indexOf(false) + 1
  let path = ''
  let connected = false
  for (let offset = 0; offset < points.length; offset++) {
    const index = (start + offset) % points.length
    if (!available[index]) {
      connected = false
      continue
    }
    path += `${connected ? 'L' : 'M'}${points[index].x},${points[index].y}`
    connected = true
  }
  if (complete && path) path += 'Z'
  return (
    <g className="recharts-radar-polygon">
      <path d={path} stroke={stroke} strokeWidth={strokeWidth} strokeDasharray={strokeDasharray}
        fill={complete ? fill : 'none'} fillOpacity={fillOpacity} />
      {!complete && points.map((point, index) => available[index]
        ? <circle key={index} cx={point.x} cy={point.y} r={2} fill={stroke} /> : null)}
    </g>
  )
}
