export const toRad = (d: number) => d * Math.PI / 180;

/**
 * Create a grayscale specular highlight image that is applied on top of the refracted glass.  
 * The bezel acts like a rim where light can reflect at grazing angles; 
 * This routine computes the per‑pixel intensity based on the alignment between the surface normal 
 * and a user supplied light direction (`angleDeg`), modulated by a Gaussian falloff from the rim and 
 * scaled by an overall `strength`.
 * 
 * Pixels inside the bezel band are black and transparent, pixels outside the rounded rectangle are ignored.  
 * The highlight is packed into both the RGB and alpha channels so that when
 *  rendered over the glass the light appears additive.
 *
 * @param objectWidth 		   Width of the object in CSS pixels
 * @param objectHeight 		   Height of the object in CSS pixels
 * @param radius  			   Corner radius of the rounded rectangle
 * @param bezelWidth 		   Width of the bezel band in pixels
 * @param angleDeg 			   Direction of incoming light measured in degrees
 * @param strength 			   Overall multiplier for highlight brightness
 * @param dpr 				   Optional device pixel ratio; defaults to `window.devicePixelRatio`
 * @param outerSpecThicknessPx Gaussian falloff width at the rim in CSS px
 */
export function buildSpecularImage(
	objectWidth: number, objectHeight: number,
	radius: number, bezelWidth: number,
	angleDeg: number, strength: number = 1, dpr?: number,
	outerSpecThicknessPx: number = 2
): ImageData {
	const DPR = dpr ?? (typeof window !== 'undefined' ? (window.devicePixelRatio ?? 1) : 1);
	const W = Math.round(objectWidth * DPR), H = Math.round(objectHeight * DPR);
	const img = new ImageData(W, H);
	new Uint32Array(img.data.buffer).fill(0);

	const R = Math.round(radius * DPR);
	const B = Math.max(1, Math.round(bezelWidth * DPR));
	const Rin = Math.max(0, R - B);
	const W2 = Math.max(0, W - 2 * B), H2 = Math.max(0, H - 2 * B);
	const vx = Math.cos(angleDeg * Math.PI / 180), vy = Math.sin(angleDeg * Math.PI / 180);

	const inRR = (x: number, y: number, w: number, h: number, r: number) => {
		const onL = x < r, onR = x >= w - r, onT = y < r, onB = y >= h - r;
		if ((onL || onR) && (onT || onB)) {
			const flatW = w - 2 * r, flatH = h - 2 * r;
			const cx = onL ? x - r : x - r - flatW;
			const cy = onT ? y - r : y - r - flatH;
			return (cx * cx + cy * cy) <= r * r + 1e-6;
		}
		return x >= 0 && x < w && y >= 0 && y < h;
	};

	for (let y = 0; y < H; y++) {
		for (let x = 0; x < W; x++) {
			const idx = (y * W + x) * 4;

			const outer = inRR(x, y, W, H, R);
			if (!outer) continue;
			const inner = W2 > 0 && H2 > 0 && inRR(x - B, y - B, W2, H2, Rin);
			if (inner) continue;

			// normals and distance across bezel                             
			let nx = 0, ny = 0, t = 0;
			const onL = x < R, onR = x >= W - R, onT = y < R, onB = y >= H - R;
			if ((onL || onR) && (onT || onB)) {
				const flatW = W - 2 * R, flatH = H - 2 * R;
				const cx = onL ? x - R : x - R - flatW;
				const cy = onT ? y - R : y - R - flatH;
				const dist = Math.max(1e-6, Math.hypot(cx, cy));
				nx = cx / dist; ny = -cy / dist; 
				t = R - dist;
			} else {
				const dL = x, dR = W - 1 - x, dT = y, dB = H - 1 - y;
				const m = Math.min(dL, dR, dT, dB);
				if (m === dT) { nx = 0; ny = -1; t = dT; }
				else if (m === dB) { nx = 0; ny = +1; t = dB; }
				else if (m === dL) { nx = -1; ny = 0; t = dL; }
				else { nx = +1; ny = 0; t = dR; }
			}

			// t = distance from outer edge [0..B] in pixels
			const align = Math.max(0, Math.abs(nx * vx + ny * vy)); 
			const T = Math.max(0.5, outerSpecThicknessPx * DPR); // band thickness in px
			if (t > 3 * T) {
				continue;
			}
			// Gaussian falloff centered at the outer edge (t = 0)
			const rim = Math.exp(-(t * t) / (2 * T * T)); 

			const coeff = Math.min(1, align * rim * Math.max(0, Math.min(1, strength))); 

			const c = Math.floor(255 * coeff);
			img.data[idx + 0] = c;
			img.data[idx + 1] = c;
			img.data[idx + 2] = c;
			img.data[idx + 3] = Math.floor(255 * coeff);
		}
	}
	return img;
}
