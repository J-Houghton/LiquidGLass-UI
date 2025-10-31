import { gsap } from 'gsap'
import Draggable from 'gsap/Draggable'
gsap.registerPlugin(Draggable)
export function enableDrag(selector='.effect'){
    Draggable.create(selector, { type: 'x,y' });
}
