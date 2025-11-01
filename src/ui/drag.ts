import { gsap } from 'gsap'
import Draggable from 'gsap/Draggable'
gsap.registerPlugin(Draggable)

export function enableDrag(
    selector = '.effect',
    onUpdate?: (s: { x: number; y: number; vx: number; vy: number; speed: number }) => void
) {
    let lastT = 0, lastX = 0, lastY = 0
    Draggable.create(selector, {
        type: 'x,y',
        onPress(this: any) {
        lastT = performance.now()
        lastX = this.x; lastY = this.y
        onUpdate?.({ x: this.x, y: this.y, vx: 0, vy: 0, speed: 0 })
        },
        onDrag(this: any) {
        const t = performance.now()
        const dt = Math.max(1, t - lastT)
        const dx = this.x - lastX
        const dy = this.y - lastY
        const vx = dx / dt
        const vy = dy / dt
        const speed = Math.hypot(vx, vy)
        lastT = t; lastX = this.x; lastY = this.y
        onUpdate?.({ x: this.x, y: this.y, vx, vy, speed })
        },
        onRelease(this: any) {
        onUpdate?.({ x: this.x, y: this.y, vx: 0, vy: 0, speed: 0 })
        }
    })
} 
