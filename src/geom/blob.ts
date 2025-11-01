// Bézier rounded-rect that deforms toward velocity.
// fx, fy are small signed factors ~[-1,1] from velocity.
export function blobPath(
  x: number, y: number, w: number, h: number,
  rx: number, ry: number,
  fx: number, fy: number
): string {
  const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v))
  const K = 0.5522847498307936 // circle-to-bezier kappa

  // Normalize deformation to a safe range
  const ax = clamp(Math.abs(fx), 0, 1)
  const ay = clamp(Math.abs(fy), 0, 1)

  // Leading vs trailing edges
  const leadRight = fx >= 0
  const leadBottom = fy >= 0

  // Corner radii bias: leading corners swell, trailing shrink
  const rxLead = clamp(rx * (1 + ax * 0.85), 0, Math.min(w, h) / 2)
  const rxTrail = clamp(rx * (1 - ax * 0.55), 0, Math.min(w, h) / 2)
  const ryLead = clamp(ry * (1 + ay * 0.85), 0, Math.min(w, h) / 2)
  const ryTrail = clamp(ry * (1 - ay * 0.55), 0, Math.min(w, h) / 2)

  const rTLx = leadRight ? rxTrail : rxLead
  const rTRx = leadRight ? rxLead  : rxTrail
  const rBLx = leadRight ? rxTrail : rxLead
  const rBRx = leadRight ? rxLead  : rxTrail

  const rTLy = leadBottom ? ryTrail : ryLead
  const rTRy = leadBottom ? ryTrail : ryLead
  const rBLy = leadBottom ? ryLead  : ryTrail
  const rBRy = leadBottom ? ryLead  : ryTrail

  // Body squash/stretch to mimic “splat”
  const sx = 1 + ax * 0.14
  const sy = 1 + ay * 0.14
  const cx = x + w / 2
  const cy = y + h / 2
  const x0 = cx - (w * sx) / 2
  const y0 = cy - (h * sy) / 2
  const W = w * sx
  const H = h * sy

  // Control handle push in flow direction
  const pushX = fx * rx * 0.6
  const pushY = fy * ry * 0.6

  // Points
  const L = x0
  const T = y0
  const R = x0 + W
  const B = y0 + H

  const kTLx = rTLx * K, kTLy = rTLy * K
  const kTRx = rTRx * K, kTRy = rTRy * K
  const kBRx = rBRx * K, kBRy = rBRy * K
  const kBLx = rBLx * K, kBLy = rBLy * K

  // Path with per-corner radii and directional push on handles
  return [
    // start at top-left corner arc start
    `M ${L + rTLx},${T}`,
    // top edge to top-right
    `C ${L + rTLx + kTLx + pushX},${T + pushY} ${R - rTRx - kTRx + pushX},${T + pushY} ${R - rTRx},${T}`,
    // top-right corner
    `C ${R - rTRx + pushX},${T + kTRy + pushY} ${R + pushX},${T + rTRy + kTRy + pushY} ${R},${T + rTRy}`,
    // right edge to bottom-right
    `C ${R},${T + rTRy + kTRy + pushY} ${R},${B - rBRy - kBRy + pushY} ${R},${B - rBRy}`,
    // bottom-right corner
    `C ${R + pushX},${B - rBRy + kBRy + pushY} ${R - rBRx + kBRx + pushX},${B + pushY} ${R - rBRx},${B}`,
    // bottom edge to bottom-left
    `C ${R - rBRx - kBRx + pushX},${B + pushY} ${L + rBLx + kBLx + pushX},${B + pushY} ${L + rBLx},${B}`,
    // bottom-left corner
    `C ${L + rBLx - kBLx + pushX},${B + pushY} ${L + pushX},${B - rBLy + kBLy + pushY} ${L},${B - rBLy}`,
    // left edge to top-left
    `C ${L + pushX},${B - rBLy - kBLy + pushY} ${L + pushX},${T + rTLy + kTLy + pushY} ${L},${T + rTLy}`,
    // top-left corner
    `C ${L + pushX},${T + rTLy - kTLy + pushY} ${L + rTLx - kTLx + pushX},${T + pushY} ${L + rTLx},${T}`,
    'Z',
  ].join(' ')
}
