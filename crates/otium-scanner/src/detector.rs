use image::DynamicImage;

use crate::geometry::{Point2D, QuadCorners};

#[derive(Debug, Clone, Copy)]
pub struct DetectedQuad {
    pub quad: QuadCorners,
    pub confidence: f32,
}

/// Multi-strategy offline document edge detector:
/// 1. Gaussian-smoothed adaptive region + Convex Hull -> 4-corner area-preserving simplification
///    (handles tilted documents & perspective distortion at any angle).
/// 2. Multi-angle gradient-aligned Hough fallback for low-contrast paper on textured surfaces.
pub fn detect_document_quad(image: &DynamicImage) -> Option<DetectedQuad> {
    let rgba = image.to_rgba8();
    let (orig_w, orig_h) = rgba.dimensions();
    if orig_w < 80 || orig_h < 80 {
        return None;
    }

    let max_side = 320.0f32;
    let scale = (max_side / orig_w.max(orig_h) as f32).min(1.0);
    let w = ((orig_w as f32 * scale).round() as usize).max(40);
    let h = ((orig_h as f32 * scale).round() as usize).max(40);

    let raw = rgba.as_raw();
    let mut r_buf = vec![0f32; w * h];
    let mut g_buf = vec![0f32; w * h];
    let mut b_buf = vec![0f32; w * h];
    let mut luma = vec![0f32; w * h];

    for y in 0..h {
        let sy = (y * orig_h as usize / h).min(orig_h as usize - 1);
        for x in 0..w {
            let sx = (x * orig_w as usize / w).min(orig_w as usize - 1);
            let idx = (sy * orig_w as usize + sx) * 4;
            let r = raw[idx] as f32;
            let g = raw[idx + 1] as f32;
            let b = raw[idx + 2] as f32;
            let i = y * w + x;
            r_buf[i] = r;
            g_buf[i] = g;
            b_buf[i] = b;
            luma[i] = 0.299 * r + 0.587 * g + 0.114 * b;
        }
    }

    // 5x5 separable Gaussian blur suppresses marble/wood grain and camera noise
    let smooth = gaussian_blur_5x5(&luma, w, h);
    let (grad_mag, grad_ang) = sobel_gradients(&smooth, w, h);

    let region_candidate = detect_via_adaptive_hull(&r_buf, &g_buf, &b_buf, &smooth, &grad_mag, w, h);
    let hough_candidate = detect_via_oriented_hough(&grad_mag, &grad_ang, w, h);

    match (region_candidate, hough_candidate) {
        (Some(a), Some(b)) => Some(if a.confidence >= b.confidence { a } else { b }),
        (Some(a), None) => Some(a),
        (None, Some(b)) => Some(b),
        (None, None) => None,
    }
}

fn detect_via_adaptive_hull(
    r_buf: &[f32],
    g_buf: &[f32],
    b_buf: &[f32],
    smooth: &[f32],
    grad_mag: &[f32],
    w: usize,
    h: usize,
) -> Option<DetectedQuad> {
    // Estimate table/background color from outer 4% border ring
    let mut border_r = Vec::new();
    let mut border_g = Vec::new();
    let mut border_b = Vec::new();
    let mut border_l = Vec::new();
    let margin_x = (w / 24).max(2);
    let margin_y = (h / 24).max(2);

    for y in 0..h {
        for x in 0..w {
            if x < margin_x || x >= w - margin_x || y < margin_y || y >= h - margin_y {
                let i = y * w + x;
                border_r.push(r_buf[i]);
                border_g.push(g_buf[i]);
                border_b.push(b_buf[i]);
                border_l.push(smooth[i]);
            }
        }
    }

    let bg_r = median_f32(&mut border_r);
    let bg_g = median_f32(&mut border_g);
    let bg_b = median_f32(&mut border_b);
    let bg_l = median_f32(&mut border_l);

    // Local mean via separable box blur (radius 18) so shadows across the page don't break segmentation
    let local_mean = box_blur_separable(smooth, w, h, (w.min(h) / 14).clamp(10, 26));

    // Otsu threshold on luminance as baseline
    let otsu = otsu_threshold_f32(smooth).unwrap_or(bg_l + 18.0);
    let mut mask = vec![false; w * h];
    for i in 0..(w * h) {
        let color_dist = ((r_buf[i] - bg_r).abs() + (g_buf[i] - bg_g).abs() + (b_buf[i] - bg_b).abs()) / 3.0;
        let brighter_than_bg = smooth[i] > (bg_l + 16.0).min(otsu);
        let locally_bright = smooth[i] >= local_mean[i] * 0.90 && color_dist > 22.0;
        mask[i] = brighter_than_bg || locally_bright;
    }

    // Connected component labeling to find largest interior paper region
    let mut visited = vec![false; w * h];
    let mut queue = Vec::with_capacity(w * h / 4);
    let mut best_boundary: Vec<Point2D> = Vec::new();
    let mut best_count = 0usize;
    let total = w * h;

    for start in 0..total {
        if !mask[start] || visited[start] {
            continue;
        }
        queue.clear();
        queue.push(start);
        visited[start] = true;
        let mut head = 0usize;
        let mut boundary = Vec::new();
        let mut border_touches = 0u8;

        while head < queue.len() {
            let idx = queue[head];
            head += 1;
            let x = idx % w;
            let y = idx / w;
            if x == 0 { border_touches |= 1; }
            if x + 1 == w { border_touches |= 2; }
            if y == 0 { border_touches |= 4; }
            if y + 1 == h { border_touches |= 8; }

            let mut is_edge = x == 0 || x + 1 == w || y == 0 || y + 1 == h;
            let neighbors = [
                if x > 0 { Some(idx - 1) } else { None },
                if x + 1 < w { Some(idx + 1) } else { None },
                if y > 0 { Some(idx - w) } else { None },
                if y + 1 < h { Some(idx + w) } else { None },
            ];
            for n in neighbors.into_iter().flatten() {
                if !mask[n] {
                    is_edge = true;
                } else if !visited[n] {
                    visited[n] = true;
                    queue.push(n);
                }
            }
            if is_edge {
                boundary.push(Point2D::new(x as f32, y as f32));
            }
        }

        let count = queue.len();
        if count > best_count
            && count >= (total as f32 * 0.10) as usize
            && count <= (total as f32 * 0.90) as usize
            && border_touches.count_ones() < 3
        {
            best_count = count;
            best_boundary = boundary;
        }
    }

    if best_boundary.len() < 16 {
        return None;
    }

    let hull = convex_hull(&mut best_boundary);
    let quad_pts = simplify_hull_to_quad(&hull)?;
    let ordered = order_quad_clockwise(quad_pts);
    validate_and_score_quad(ordered, grad_mag, w, h)
}

fn detect_via_oriented_hough(
    grad_mag: &[f32],
    grad_ang: &[f32],
    w: usize,
    h: usize,
) -> Option<DetectedQuad> {
    let diag = ((w * w + h * h) as f32).sqrt().ceil() as usize + 2;
    let stride = diag * 2 + 1;
    let mut acc = vec![0u32; 180 * stride];

    let cos_lut: Vec<f32> = (0..180).map(|a| (a as f32).to_radians().cos()).collect();
    let sin_lut: Vec<f32> = (0..180).map(|a| (a as f32).to_radians().sin()).collect();

    // Adaptive edge threshold: top gradient magnitudes
    let mut mags: Vec<f32> = grad_mag.iter().copied().filter(|&m| m > 18.0).collect();
    if mags.len() < 80 {
        return None;
    }
    let idx82 = (mags.len() * 82 / 100).min(mags.len() - 1);
    mags.select_nth_unstable_by(idx82, |a, b| a.partial_cmp(b).unwrap_or(std::cmp::Ordering::Equal));
    let mag_thresh = mags[idx82].max(28.0);

    for y in 2..(h - 2) {
        for x in 2..(w - 2) {
            let m = grad_mag[y * w + x];
            if m < mag_thresh {
                continue;
            }
            let ang = (grad_ang[y * w + x].round() as i32).rem_euclid(180) as usize;
            for delta in -2i32..=2 {
                let a = (ang as i32 + delta).rem_euclid(180) as usize;
                let rho = (x as f32 * cos_lut[a] + y as f32 * sin_lut[a]).round() as isize + diag as isize;
                if rho >= 0 && (rho as usize) < stride {
                    acc[a * stride + rho as usize] += 1;
                }
            }
        }
    }

    #[derive(Clone, Copy)]
    struct HoughLine {
        angle: usize,
        rho: f32,
        votes: u32,
    }

    let min_votes = (w.min(h) / 10).max(14) as u32;
    let mut lines = Vec::new();
    for a in 0..180 {
        for r in 2..(stride - 2) {
            let v = acc[a * stride + r];
            if v < min_votes {
                continue;
            }
            if v >= acc[a * stride + r - 1] && v >= acc[a * stride + r + 1] {
                lines.push(HoughLine {
                    angle: a,
                    rho: r as f32 - diag as f32,
                    votes: v,
                });
            }
        }
    }
    lines.sort_by(|a, b| b.votes.cmp(&a.votes));
    lines.truncate(28);

    let mut best: Option<DetectedQuad> = None;
    let cx = w as f32 * 0.5;
    let cy = h as f32 * 0.5;

    for i in 0..lines.len() {
        for j in (i + 1)..lines.len() {
            let l1 = lines[i];
            let l2 = lines[j];
            if angle_diff_deg(l1.angle, l2.angle) > 22.0 {
                continue;
            }
            let d1 = l1.rho - (cx * cos_lut[l1.angle] + cy * sin_lut[l1.angle]);
            let d2 = l2.rho - (cx * cos_lut[l2.angle] + cy * sin_lut[l2.angle]);
            if d1 * d2 >= 0.0 || (d1 - d2).abs() < w.min(h) as f32 * 0.28 {
                continue;
            }

            // Find perpendicular pair
            for k in 0..lines.len() {
                let l3 = lines[k];
                let perp_diff = angle_diff_deg(l1.angle, l3.angle);
                if perp_diff < 65.0 || perp_diff > 115.0 {
                    continue;
                }
                for m in (k + 1)..lines.len() {
                    let l4 = lines[m];
                    if angle_diff_deg(l3.angle, l4.angle) > 22.0 {
                        continue;
                    }
                    let d3 = l3.rho - (cx * cos_lut[l3.angle] + cy * sin_lut[l3.angle]);
                    let d4 = l4.rho - (cx * cos_lut[l4.angle] + cy * sin_lut[l4.angle]);
                    if d3 * d4 >= 0.0 || (d3 - d4).abs() < w.min(h) as f32 * 0.28 {
                        continue;
                    }

                    let p1 = intersect_lines(l1.angle, l1.rho, l3.angle, l3.rho, &cos_lut, &sin_lut);
                    let p2 = intersect_lines(l1.angle, l1.rho, l4.angle, l4.rho, &cos_lut, &sin_lut);
                    let p3 = intersect_lines(l2.angle, l2.rho, l4.angle, l4.rho, &cos_lut, &sin_lut);
                    let p4 = intersect_lines(l2.angle, l2.rho, l3.angle, l3.rho, &cos_lut, &sin_lut);
                    if let (Some(a), Some(b), Some(c), Some(d)) = (p1, p2, p3, p4) {
                        let ordered = order_quad_clockwise([a, b, c, d]);
                        if let Some(cand) = validate_and_score_quad(ordered, grad_mag, w, h) {
                            if best.map_or(true, |prev| cand.confidence > prev.confidence) {
                                best = Some(cand);
                            }
                        }
                    }
                }
            }
        }
    }

    best
}

fn intersect_lines(
    a1: usize,
    r1: f32,
    a2: usize,
    r2: f32,
    cos_lut: &[f32],
    sin_lut: &[f32],
) -> Option<Point2D> {
    let det = cos_lut[a1] * sin_lut[a2] - sin_lut[a1] * cos_lut[a2];
    if det.abs() < 0.25 {
        return None;
    }
    let x = (r1 * sin_lut[a2] - sin_lut[a1] * r2) / det;
    let y = (cos_lut[a1] * r2 - r1 * cos_lut[a2]) / det;
    Some(Point2D::new(x, y))
}

fn validate_and_score_quad(
    pts: [Point2D; 4],
    grad_mag: &[f32],
    w: usize,
    h: usize,
) -> Option<DetectedQuad> {
    let wf = w as f32;
    let hf = h as f32;

    // Bounds check with tiny tolerance
    for p in pts {
        if p.x < -wf * 0.03 || p.x > wf * 1.03 || p.y < -hf * 0.03 || p.y > hf * 1.03 {
            return None;
        }
    }

    // Polygon area (shoelace)
    let area = 0.5
        * ((pts[0].x * pts[1].y - pts[1].x * pts[0].y)
            + (pts[1].x * pts[2].y - pts[2].x * pts[1].y)
            + (pts[2].x * pts[3].y - pts[3].x * pts[2].y)
            + (pts[3].x * pts[0].y - pts[0].x * pts[3].y))
            .abs();
    let frame_area = wf * hf;
    let area_ratio = area / frame_area;
    if !(0.10..=0.92).contains(&area_ratio) {
        return None;
    }

    // Check convexity and interior corner angles (45° .. 135°)
    let mut signs = 0i32;
    for i in 0..4 {
        let a = pts[i];
        let b = pts[(i + 1) % 4];
        let c = pts[(i + 2) % 4];
        let abx = b.x - a.x;
        let aby = b.y - a.y;
        let bcx = c.x - b.x;
        let bcy = c.y - b.y;
        let cross = abx * bcy - aby * bcx;
        signs += if cross > 0.0 { 1 } else { -1 };

        let len1 = (abx * abx + aby * aby).sqrt();
        let len2 = (bcx * bcx + bcy * bcy).sqrt();
        if len1 < wf.min(hf) * 0.15 || len2 < wf.min(hf) * 0.15 {
            return None;
        }
        let cos_angle = ((-abx * bcx - aby * bcy) / (len1 * len2)).clamp(-1.0, 1.0);
        let deg = cos_angle.acos().to_degrees();
        if !(45.0..=135.0).contains(&deg) {
            return None;
        }
    }
    if signs.abs() != 4 {
        return None;
    }

    // Edge gradient support along all 4 sides
    let mut edge_hits = 0u32;
    let samples_per_side = 20;
    for side in 0..4 {
        let p0 = pts[side];
        let p1 = pts[(side + 1) % 4];
        for s in 1..samples_per_side {
            let t = s as f32 / samples_per_side as f32;
            let px = (p0.x + (p1.x - p0.x) * t).round() as isize;
            let py = (p0.y + (p1.y - p0.y) * t).round() as isize;
            let mut max_g = 0.0f32;
            for dy in -2..=2 {
                for dx in -2..=2 {
                    let nx = px + dx;
                    let ny = py + dy;
                    if nx >= 0 && nx < w as isize && ny >= 0 && ny < h as isize {
                        max_g = max_g.max(grad_mag[ny as usize * w + nx as usize]);
                    }
                }
            }
            if max_g > 22.0 {
                edge_hits += 1;
            }
        }
    }

    let edge_support = edge_hits as f32 / (4.0 * (samples_per_side - 1) as f32);
    if edge_support < 0.35 {
        return None;
    }

    let norm = |p: Point2D| Point2D::new((p.x / wf).clamp(0.0, 1.0), (p.y / hf).clamp(0.0, 1.0));
    let confidence = (edge_support * 0.7 + area_ratio.min(0.8) * 0.3).clamp(0.0, 1.0);
    Some(DetectedQuad {
        quad: QuadCorners::new(norm(pts[0]), norm(pts[1]), norm(pts[2]), norm(pts[3])),
        confidence,
    })
}

fn convex_hull(points: &mut Vec<Point2D>) -> Vec<Point2D> {
    points.sort_by(|a, b| {
        a.x.partial_cmp(&b.x)
            .unwrap_or(std::cmp::Ordering::Equal)
            .then_with(|| a.y.partial_cmp(&b.y).unwrap_or(std::cmp::Ordering::Equal))
    });
    let mut lower: Vec<Point2D> = Vec::new();
    for &p in points.iter() {
        while lower.len() >= 2 && cross(lower[lower.len() - 2], lower[lower.len() - 1], p) <= 0.0 {
            lower.pop();
        }
        lower.push(p);
    }
    let mut upper: Vec<Point2D> = Vec::new();
    for &p in points.iter().rev() {
        while upper.len() >= 2 && cross(upper[upper.len() - 2], upper[upper.len() - 1], p) <= 0.0 {
            upper.pop();
        }
        upper.push(p);
    }
    lower.pop();
    upper.pop();
    lower.extend(upper);
    lower
}

fn simplify_hull_to_quad(hull: &[Point2D]) -> Option<[Point2D; 4]> {
    if hull.len() < 4 {
        return None;
    }
    let mut pts = hull.to_vec();
    while pts.len() > 4 {
        let n = pts.len();
        let mut min_idx = 0;
        let mut min_area = f32::MAX;
        for i in 0..n {
            let a = pts[(i + n - 1) % n];
            let b = pts[i];
            let c = pts[(i + 1) % n];
            let tri_area = cross(a, b, c).abs();
            if tri_area < min_area {
                min_area = tri_area;
                min_idx = i;
            }
        }
        pts.remove(min_idx);
    }
    Some([pts[0], pts[1], pts[2], pts[3]])
}

fn order_quad_clockwise(pts: [Point2D; 4]) -> [Point2D; 4] {
    let mut cx = 0.0f32;
    let mut cy = 0.0f32;
    for p in pts {
        cx += p.x;
        cy += p.y;
    }
    cx *= 0.25;
    cy *= 0.25;

    let mut sorted = pts;
    sorted.sort_by(|a, b| {
        let ang_a = (a.y - cy).atan2(a.x - cx);
        let ang_b = (b.y - cy).atan2(b.x - cx);
        ang_a.partial_cmp(&ang_b).unwrap_or(std::cmp::Ordering::Equal)
    });

    // Rotate slice so top-left (smallest x+y) is index 0
    let mut tl_idx = 0;
    let mut min_sum = f32::MAX;
    for (i, p) in sorted.iter().enumerate() {
        let s = p.x + p.y;
        if s < min_sum {
            min_sum = s;
            tl_idx = i;
        }
    }
    [
        sorted[tl_idx],
        sorted[(tl_idx + 1) % 4],
        sorted[(tl_idx + 2) % 4],
        sorted[(tl_idx + 3) % 4],
    ]
}

fn cross(o: Point2D, a: Point2D, b: Point2D) -> f32 {
    (a.x - o.x) * (b.y - o.y) - (a.y - o.y) * (b.x - o.x)
}

fn angle_diff_deg(a: usize, b: usize) -> f32 {
    let d = (a as i32 - b as i32).abs() % 180;
    d.min(180 - d) as f32
}

fn gaussian_blur_5x5(src: &[f32], w: usize, h: usize) -> Vec<f32> {
    let k = [1.0f32, 4.0, 6.0, 4.0, 1.0];
    let mut tmp = vec![0.0f32; w * h];
    for y in 0..h {
        let row = y * w;
        for x in 0..w {
            let mut sum = 0.0f32;
            for (ki, &kv) in k.iter().enumerate() {
                let sx = (x as isize + ki as isize - 2).clamp(0, w as isize - 1) as usize;
                sum += src[row + sx] * kv;
            }
            tmp[row + x] = sum / 16.0;
        }
    }
    let mut out = vec![0.0f32; w * h];
    for y in 0..h {
        for x in 0..w {
            let mut sum = 0.0f32;
            for (ki, &kv) in k.iter().enumerate() {
                let sy = (y as isize + ki as isize - 2).clamp(0, h as isize - 1) as usize;
                sum += tmp[sy * w + x] * kv;
            }
            out[y * w + x] = sum / 16.0;
        }
    }
    out
}

fn sobel_gradients(src: &[f32], w: usize, h: usize) -> (Vec<f32>, Vec<f32>) {
    let mut mag = vec![0.0f32; w * h];
    let mut ang = vec![0.0f32; w * h];
    for y in 1..(h - 1) {
        for x in 1..(w - 1) {
            let i = y * w + x;
            let gx = src[i - w + 1] + 2.0 * src[i + 1] + src[i + w + 1]
                - src[i - w - 1]
                - 2.0 * src[i - 1]
                - src[i + w - 1];
            let gy = src[i + w - 1] + 2.0 * src[i + w] + src[i + w + 1]
                - src[i - w - 1]
                - 2.0 * src[i - w]
                - src[i - w + 1];
            mag[i] = (gx * gx + gy * gy).sqrt();
            ang[i] = gy.atan2(gx).to_degrees();
        }
    }
    (mag, ang)
}

fn box_blur_separable(src: &[f32], w: usize, h: usize, radius: usize) -> Vec<f32> {
    let mut horiz = vec![0.0f32; w * h];
    for y in 0..h {
        let row = y * w;
        for x in 0..w {
            let x0 = x.saturating_sub(radius);
            let x1 = (x + radius).min(w - 1);
            let mut sum = 0.0f32;
            for xx in x0..=x1 {
                sum += src[row + xx];
            }
            horiz[row + x] = sum / (x1 - x0 + 1) as f32;
        }
    }
    let mut out = vec![0.0f32; w * h];
    for y in 0..h {
        let y0 = y.saturating_sub(radius);
        let y1 = (y + radius).min(h - 1);
        let cnt = (y1 - y0 + 1) as f32;
        for x in 0..w {
            let mut sum = 0.0f32;
            for yy in y0..=y1 {
                sum += horiz[yy * w + x];
            }
            out[y * w + x] = sum / cnt;
        }
    }
    out
}

fn median_f32(vals: &mut [f32]) -> f32 {
    if vals.is_empty() {
        return 128.0;
    }
    let mid = vals.len() / 2;
    vals.select_nth_unstable_by(mid, |a, b| a.partial_cmp(b).unwrap_or(std::cmp::Ordering::Equal));
    vals[mid]
}

fn otsu_threshold_f32(luma: &[f32]) -> Option<f32> {
    let mut hist = [0u32; 256];
    for &v in luma {
        hist[(v.clamp(0.0, 255.0)) as usize] += 1;
    }
    let total = luma.len() as f64;
    let sum: f64 = hist.iter().enumerate().map(|(i, &c)| i as f64 * c as f64).sum();
    let mut w_b = 0.0;
    let mut sum_b = 0.0;
    let mut best_var = 0.0;
    let mut best_t = 128;
    for (i, &c) in hist.iter().enumerate() {
        w_b += c as f64;
        if w_b == 0.0 {
            continue;
        }
        let w_f = total - w_b;
        if w_f == 0.0 {
            break;
        }
        sum_b += i as f64 * c as f64;
        let diff = sum_b / w_b - (sum - sum_b) / w_f;
        let var = w_b * w_f * diff * diff;
        if var > best_var {
            best_var = var;
            best_t = i;
        }
    }
    if best_var > total * total * 80.0 {
        Some(best_t as f32)
    } else {
        None
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use image::{Rgba, RgbaImage};

    #[test]
    fn detects_tilted_document_on_textured_table() {
        let mut img = RgbaImage::new(320, 420);
        for y in 0..420 {
            for x in 0..320 {
                // Marble-like noisy dark background
                let noise = ((x * 17 + y * 31) % 25) as u8;
                img.put_pixel(x, y, Rgba([95 + noise, 80 + noise, 70 + noise, 255]));
            }
        }
        // Draw a slightly tilted white paper sheet inside
        for y in 60..360 {
            let skew = (y as f32 - 60.0) * 0.08;
            let x_start = (45.0 + skew) as u32;
            let x_end = (265.0 + skew * 0.5) as u32;
            for x in x_start..x_end {
                img.put_pixel(x, y, Rgba([235, 235, 232, 255]));
            }
        }

        let detected = detect_document_quad(&DynamicImage::ImageRgba8(img))
            .expect("should detect tilted paper on textured background");
        assert!(detected.confidence > 0.4);
        assert!(detected.quad.top_left.x < 0.25 && detected.quad.top_left.y < 0.25);
        assert!(detected.quad.bottom_right.x > 0.70 && detected.quad.bottom_right.y > 0.75);
    }
}
