/**
 * Construct a two‑dimensional displacement map for refraction inside a rounded rectangle.  
 * Each pixel in the returned `ImageData` stores a unit displacement vector pointing opposite the outward normal of the bezel band 
 * 	(packed into the red and green channels with a 128 bias and 127 scale), 
 *  and a magnitude proportional to a precomputed 1D displacement curve.
 * 
 * The resulting map is used by an SVG filter to offset sampling coordinates when rendering the glass effect.  
 * Pixels outside the bezel band are left unchanged.  
 * The `maximumDisplacement` parameter normalizes the precomputed values so that the map fits within the 8‑bit colour range.
 *
 * @param canvasWidth 				 Width of the effect in CSS pixels
 * @param canvasHeight 				 Height of the effect in CSS pixels
 * @param radius 					 Corner radius of the rounded rectangle
 * @param bezelWidth 				 Width of the outer bezel band in pixels
 * @param maximumDisplacement 		 Maximum absolute displacement from the 1D map
 * @param precomputedDisplacementMap Array of scalar displacements indexed by relative position [0..1] across the bezel. 
 * 									   Empty if no refraction occurs.
 * @param dpr 						 Optional device pixel ratio override; defaults to `window.devicePixelRatio` when available
 */
export function calculateDisplacementMap2(
	canvasWidth: number, canvasHeight: number,
	radius: number, bezelWidth: number,
	maximumDisplacement: number,
	precomputedDisplacementMap: number[] = [],
	dpr?: number
): ImageData {
	const DPR = dpr ?? (typeof window !== 'undefined' ? (window.devicePixelRatio ?? 1) : 1);

	const W = Math.round(canvasWidth * DPR), H = Math.round(canvasHeight * DPR);
	const imageData = new ImageData(W, H);
	new Uint32Array(imageData.data.buffer).fill(0xff008080);

	const R = Math.round(radius * DPR); 
	const B = Math.max(1, Math.round(bezelWidth * DPR));
	const Rin = Math.max(0, R - B);
	const W2 = Math.max(0, W - 2 * B), H2 = Math.max(0, H - 2 * B);

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

			// distance into the band [0..B] and outward normal               
			let nx = 0, ny = 0, t = 0;

			// corner sector
			const onL = x < R, onR = x >= W - R, onT = y < R, onB = y >= H - R;
			if ((onL || onR) && (onT || onB)) {
				const flatW = W - 2 * R, flatH = H - 2 * R;
				const cx = onL ? x - R : x - R - flatW;
				const cy = onT ? y - R : y - R - flatH;
				const dist = Math.max(1e-6, Math.hypot(cx, cy));
				nx = cx / dist; ny = cy / dist;
				t = R - dist; // 0 at rim → B at inner edge
			} else {
				// flats: pick the nearest edge
				const dL = x, dR = W - 1 - x, dT = y, dB = H - 1 - y;
				const m = Math.min(dL, dR, dT, dB);
				if (m === dT) { nx = 0; ny = -1; t = dT; }
				else if (m === dB) { nx = 0; ny = +1; t = dB; }
				else if (m === dL) { nx = -1; ny = 0; t = dL; }
				else { nx = +1; ny = 0; t = dR; }
			}

			const u = Math.max(0, Math.min(1, t / B)); // [0..1] across bezel
			const i = Math.min(precomputedDisplacementMap.length - 1, (u * precomputedDisplacementMap.length) | 0);
			const disp = precomputedDisplacementMap[i] || 0;

			// outward normal → use -n for inward refraction feel, same as before
			const dX = (-nx * disp) / maximumDisplacement;
			const dY = (-ny * disp) / maximumDisplacement;

			imageData.data[idx + 0] = 128 + dX * 127;
			imageData.data[idx + 1] = 128 + dY * 127;
			imageData.data[idx + 2] = 0;
			imageData.data[idx + 3] = 255;
		}
	}
	return imageData;
}
