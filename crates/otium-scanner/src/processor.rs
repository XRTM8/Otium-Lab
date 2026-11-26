use image::{DynamicImage, GrayImage, RgbaImage};

use crate::geometry::{HomographyMatrix, Point2D, QuadCorners};
use otium_core::{OtiumError, Result};

#[inline]
fn catmull_rom_weights(t: f32) -> [f32; 4] {
    let t2 = t * t;
    let t3 = t2 * t;
    [
        0.5 * (-t + 2.0 * t2 - t3),
        0.5 * (2.0 - 5.0 * t2 + 3.0 * t3),
        0.5 * (t + 4.0 * t2 - 3.0 * t3),
        0.5 * (-t2 + t3),
    ]
}

#[inline]
fn out_buffer_write(chunk: &mut [u8], offset: usize, acc: [f32; 4]) {
    chunk[offset] = acc[0].clamp(0.0, 255.0) as u8;
    chunk[offset + 1] = acc[1].clamp(0.0, 255.0) as u8;
    chunk[offset + 2] = acc[2].clamp(0.0, 255.0) as u8;
    chunk[offset + 3] = acc[3].clamp(0.0, 255.0) as u8;
}

pub struct DocumentScanner;

impl DocumentScanner {
    /// Warp a quadrilateral document region into a rectified rectangular image using
    /// bilinear interpolation with optimized contiguous row buffer layout.
    pub fn warp_perspective(
        image: &DynamicImage,
        corners: &QuadCorners,
        target_dimensions: Option<(u32, u32)>,
    ) -> Result<RgbaImage> {
        let (dst_w, dst_h) = target_dimensions
            .unwrap_or_else(|| corners.estimate_target_dimensions());

        if dst_w == 0 || dst_h == 0 {
            return Err(OtiumError::ImageProcessing("Invalid zero dimensions".into()));
        }

        let homography = HomographyMatrix::from_rect_to_quad(corners, dst_w as f32, dst_h as f32)
            .ok_or_else(|| OtiumError::ImageProcessing("Singular quad corners matrix".into()))?;

        let src_rgba = image.to_rgba8();
        let (src_w, src_h) = src_rgba.dimensions();
        let src_stride = (src_w * 4) as usize;
        let src_raw = src_rgba.as_raw();

        let max_x_bound = (src_w - 1) as f32;
        let max_y_bound = (src_h - 1) as f32;
        let dst_stride = (dst_w as usize) * 4;
        let total_pixels = (dst_w as usize) * (dst_h as usize);
        let mut out_buffer: Vec<u8> = vec![255u8; total_pixels * 4];

        let num_threads = std::thread::available_parallelism()
            .map(|n| n.get())
            .unwrap_or(4)
            .min(8)
            .max(1);
        let rows_per_chunk = ((dst_h as usize) + num_threads - 1) / num_threads;

        std::thread::scope(|scope| {
            for (chunk_idx, chunk) in out_buffer.chunks_mut(rows_per_chunk * dst_stride).enumerate() {
                let start_y = chunk_idx * rows_per_chunk;
                let chunk_rows = chunk.len() / dst_stride;
                scope.spawn(move || {
                    for local_y in 0..chunk_rows {
                        let y = (start_y + local_y) as u32;
                        let row_offset = local_y * dst_stride;
                        for x in 0..dst_w {
                            let pixel_offset = row_offset + (x as usize) * 4;
                            let src_pt = homography.transform_point(Point2D::new(x as f32, y as f32));
                            let sx = src_pt.x;
                            let sy = src_pt.y;

                            if sx >= 1.0 && sx < max_x_bound - 1.0 && sy >= 1.0 && sy < max_y_bound - 1.0 {
                                // Catmull-Rom 4x4 bicubic interpolation for crisp Arabic/Latin strokes
                                let x_int = sx.floor() as isize;
                                let y_int = sy.floor() as isize;
                                let fx = sx - x_int as f32;
                                let fy = sy - y_int as f32;

                                let wx = catmull_rom_weights(fx);
                                let wy = catmull_rom_weights(fy);

                                let mut rgba_acc = [0.0f32; 4];
                                for (ky, &wy_val) in wy.iter().enumerate() {
                                    let row_base = ((y_int + ky as isize - 1) as usize) * src_stride;
                                    for (kx, &wx_val) in wx.iter().enumerate() {
                                        let w = wx_val * wy_val;
                                        let idx = row_base + ((x_int + kx as isize - 1) as usize) * 4;
                                        rgba_acc[0] += src_raw[idx] as f32 * w;
                                        rgba_acc[1] += src_raw[idx + 1] as f32 * w;
                                        rgba_acc[2] += src_raw[idx + 2] as f32 * w;
                                        rgba_acc[3] += src_raw[idx + 3] as f32 * w;
                                    }
                                }
                                out_buffer_write(chunk, pixel_offset, rgba_acc);
                            } else if sx >= 0.0 && sx < max_x_bound && sy >= 0.0 && sy < max_y_bound {
                                let x0 = sx as usize;
                                let y0 = sy as usize;
                                let fx = sx - (x0 as f32);
                                let fy = sy - (y0 as f32);
                                let inv_fx = 1.0 - fx;
                                let inv_fy = 1.0 - fy;
                                let [idx00, idx10, idx01, idx11] =
                                    otium_scan_math::rgba_neighbors(x0, y0, src_stride);

                                for c in 0..4 {
                                    let top = inv_fx * src_raw[idx00 + c] as f32 + fx * src_raw[idx10 + c] as f32;
                                    let bottom = inv_fx * src_raw[idx01 + c] as f32 + fx * src_raw[idx11 + c] as f32;
                                    chunk[pixel_offset + c] = (inv_fy * top + fy * bottom).clamp(0.0, 255.0) as u8;
                                }
                            } else {
                                chunk[pixel_offset] = 255;
                                chunk[pixel_offset + 1] = 255;
                                chunk[pixel_offset + 2] = 255;
                                chunk[pixel_offset + 3] = 255;
                            }
                        }
                    }
                });
            }
        });

        RgbaImage::from_raw(dst_w, dst_h, out_buffer)
            .ok_or_else(|| OtiumError::ImageProcessing("Failed to construct image buffer".into()))
    }

    /// High-performance document clean filter with local illumination normalization:
    /// Removes phone/hand shadows via 1/8-scale morphological background estimation,
    /// sharpens text strokes, and whitens paper while preserving crisp Arabic/Latin glyphs.
    pub fn clean_document_filter(image: &RgbaImage, contrast_boost: f32) -> GrayImage {
        let (width, height) = image.dimensions();
        let total_pixels = (width as usize) * (height as usize);
        if total_pixels == 0 {
            return GrayImage::new(0, 0);
        }

        let raw = image.as_raw();
        let w = width as usize;
        let h = height as usize;

        // 1. Fast integer luminance pass
        let mut luma = Vec::with_capacity(total_pixels);
        for i in (0..raw.len()).step_by(4) {
            let r = raw[i] as u32;
            let g = raw[i + 1] as u32;
            let b = raw[i + 2] as u32;
            luma.push(((r * 77 + g * 150 + b * 29) >> 8) as u8);
        }

        // 2. Estimate smooth local paper background (removes shadows & uneven lighting)
        let (bg_w, bg_h, bg_luma) = Self::estimate_luma_background(&luma, w, h);

        // 3. Illumination normalization: divide pixel luminance by local background
        let mut norm = vec![0u8; total_pixels];
        for y in 0..h {
            let row_off = y * w;
            for x in 0..w {
                let bg = Self::sample_bg_scalar(&bg_luma, bg_w, bg_h, x, y, w, h).max(24.0);
                let val = (luma[row_off + x] as f32) * 255.0 / bg;
                norm[row_off + x] = val.clamp(0.0, 255.0) as u8;
            }
        }

        // 4. Subtle 3x3 unsharp mask + adaptive tone curve
        let is_bw = contrast_boost >= 1.8;
        let white_cut = if is_bw { 188.0 } else { 205.0 };
        let black_cut = if is_bw { 115.0 } else { 55.0 };
        let sharp_amount = if is_bw { 0.45 } else { 0.30 };

        let mut out_gray = vec![255u8; total_pixels];
        for y in 0..h {
            let row_off = y * w;
            for x in 0..w {
                let idx = row_off + x;
                let center = norm[idx] as f32;
                let sharpened = if x > 0 && x + 1 < w && y > 0 && y + 1 < h {
                    let avg = (norm[idx - w] as f32
                        + norm[idx + w] as f32
                        + norm[idx - 1] as f32
                        + norm[idx + 1] as f32)
                        * 0.25;
                    (center + sharp_amount * (center - avg)).clamp(0.0, 255.0)
                } else {
                    center
                };

                out_gray[idx] = if sharpened >= white_cut {
                    255
                } else if sharpened <= black_cut {
                    if is_bw { 0 } else { (sharpened * 0.55) as u8 }
                } else {
                    let t = ((sharpened - black_cut) / (white_cut - black_cut)).clamp(0.0, 1.0);
                    let curved = t.powf(contrast_boost);
                    (curved * 255.0).clamp(0.0, 255.0) as u8
                };
            }
        }

        GrayImage::from_raw(width, height, out_gray)
            .unwrap_or_else(|| GrayImage::new(width, height))
    }

    /// Professional Magic Color filter:
    /// Removes shadows and auto-white-balances uneven indoor lighting per channel,
    /// whitens paper cleanly, and boosts color vibrance for stamps, signatures, and ink.
    pub fn magic_color_filter(image: &RgbaImage) -> RgbaImage {
        let (width, height) = image.dimensions();
        let total_pixels = (width as usize) * (height as usize);
        if total_pixels == 0 {
            return RgbaImage::new(0, 0);
        }

        let raw = image.as_raw();
        let w = width as usize;
        let h = height as usize;

        let (bg_w, bg_h, bg_rgb) = Self::estimate_rgb_background(raw, w, h);
        let mut out_buffer = Vec::with_capacity(total_pixels * 4);

        for y in 0..h {
            let row_off = y * w;
            for x in 0..w {
                let i = (row_off + x) * 4;
                let r = raw[i] as f32;
                let g = raw[i + 1] as f32;
                let b = raw[i + 2] as f32;
                let a = raw[i + 3];

                let (bg_r, bg_g, bg_b) = Self::sample_bg_rgb(&bg_rgb, bg_w, bg_h, x, y, w, h);
                let nr = (r * 255.0 / bg_r.max(24.0)).clamp(0.0, 255.0);
                let ng = (g * 255.0 / bg_g.max(24.0)).clamp(0.0, 255.0);
                let nb = (b * 255.0 / bg_b.max(24.0)).clamp(0.0, 255.0);

                let min_c = nr.min(ng).min(nb);
                let max_c = nr.max(ng).max(nb);
                let chroma = max_c - min_c;

                // Cleanly snap neutral near-white paper to pure white
                if min_c > 210.0 && chroma < 28.0 {
                    out_buffer.push(255);
                    out_buffer.push(255);
                    out_buffer.push(255);
                    out_buffer.push(a);
                } else {
                    // Boost color vibrance & deepen ink contrast
                    let luma = 0.299 * nr + 0.587 * ng + 0.114 * nb;
                    let contrast_luma = if luma < 175.0 {
                        (luma * 0.90).clamp(0.0, 255.0)
                    } else {
                        luma
                    };
                    let delta_l = contrast_luma - luma;
                    let sat = 1.25f32;
                    let fr = (contrast_luma + (nr - luma) * sat + delta_l * 0.2).clamp(0.0, 255.0) as u8;
                    let fg = (contrast_luma + (ng - luma) * sat + delta_l * 0.2).clamp(0.0, 255.0) as u8;
                    let fb = (contrast_luma + (nb - luma) * sat + delta_l * 0.2).clamp(0.0, 255.0) as u8;
                    out_buffer.push(fr);
                    out_buffer.push(fg);
                    out_buffer.push(fb);
                    out_buffer.push(a);
                }
            }
        }

        RgbaImage::from_raw(width, height, out_buffer)
            .unwrap_or_else(|| image.clone())
    }

    /// Estimates residual text-line tilt in [-6.0, +6.0] degrees using horizontal
    /// projection profile variance on a downscaled grayscale thumbnail, then rotates
    /// the image with bilinear interpolation and white paper fill.
    pub fn deskew_rgba(image: &RgbaImage) -> RgbaImage {
        let (w, h) = image.dimensions();
        if w < 120 || h < 120 {
            return image.clone();
        }
        let scale = (320.0 / w.max(h) as f32).min(1.0);
        let sw = ((w as f32 * scale).round() as usize).max(40);
        let sh = ((h as f32 * scale).round() as usize).max(40);
        let raw = image.as_raw();
        let mut dark = vec![0.0f32; sw * sh];
        for y in 0..sh {
            let sy = (y * h as usize / sh).min(h as usize - 1);
            for x in 0..sw {
                let sx = (x * w as usize / sw).min(w as usize - 1);
                let i = (sy * w as usize + sx) * 4;
                let luma = (raw[i] as u32 * 77 + raw[i + 1] as u32 * 150 + raw[i + 2] as u32 * 29) >> 8;
                dark[y * sw + x] = if luma < 140 { 1.0 } else { 0.0 };
            }
        }

        let mut best_angle = 0.0f32;
        let mut best_score = -1.0f32;
        let cx = sw as f32 * 0.5;
        let cy = sh as f32 * 0.5;
        for step in -12..=12 {
            let deg = step as f32 * 0.5;
            let rad = deg.to_radians();
            let sin_a = rad.sin();
            let cos_a = rad.cos();
            let mut row_sums = vec![0.0f32; sh];
            for y in (sh / 8)..(sh * 7 / 8) {
                for x in (sw / 8)..(sw * 7 / 8) {
                    if dark[y * sw + x] > 0.5 {
                        let ry = ((x as f32 - cx) * sin_a + (y as f32 - cy) * cos_a + cy).round() as isize;
                        if ry >= 0 && (ry as usize) < sh {
                            row_sums[ry as usize] += 1.0;
                        }
                    }
                }
            }
            let mean = row_sums.iter().sum::<f32>() / sh as f32;
            let var = row_sums.iter().map(|&v| (v - mean) * (v - mean)).sum::<f32>() / sh as f32;
            if var > best_score {
                best_score = var;
                best_angle = deg;
            }
        }

        if best_angle.abs() < 0.4 {
            return image.clone();
        }

        let rad = (-best_angle).to_radians();
        let cos_a = rad.cos();
        let sin_a = rad.sin();
        let w_f = w as f32;
        let h_f = h as f32;
        let cx_full = w_f * 0.5;
        let cy_full = h_f * 0.5;
        let stride = (w as usize) * 4;
        let mut out = vec![255u8; (w as usize) * (h as usize) * 4];

        for y in 0..h {
            let dy = y as f32 - cy_full;
            let row_off = (y as usize) * stride;
            for x in 0..w {
                let dx = x as f32 - cx_full;
                let sx = dx * cos_a - dy * sin_a + cx_full;
                let sy = dx * sin_a + dy * cos_a + cy_full;
                if sx >= 0.0 && sx < w_f - 1.0 && sy >= 0.0 && sy < h_f - 1.0 {
                    let x0 = sx as usize;
                    let y0 = sy as usize;
                    let fx = sx - x0 as f32;
                    let fy = sy - y0 as f32;
                    let [i00, i10, i01, i11] = otium_scan_math::rgba_neighbors(x0, y0, stride);
                    let dst = row_off + (x as usize) * 4;
                    for c in 0..4 {
                        let top = (1.0 - fx) * raw[i00 + c] as f32 + fx * raw[i10 + c] as f32;
                        let bot = (1.0 - fx) * raw[i01 + c] as f32 + fx * raw[i11 + c] as f32;
                        out[dst + c] = ((1.0 - fy) * top + fy * bot).clamp(0.0, 255.0) as u8;
                    }
                }
            }
        }

        RgbaImage::from_raw(w, h, out).unwrap_or_else(|| image.clone())
    }

    /// Cleans accidental skin-tone finger intrusions on the outer 7% left/right margins
    /// by replacing detected skin pixels with neutral white paper.
    pub fn remove_margin_fingers(image: &RgbaImage) -> RgbaImage {
        let (w, h) = image.dimensions();
        if w < 60 || h < 60 {
            return image.clone();
        }
        let margin_w = (w as f32 * 0.07).round() as u32;
        let mut out = image.clone();
        for y in 0..h {
            for x in 0..w {
                if x >= margin_w && x < w - margin_w {
                    continue;
                }
                let p = out.get_pixel(x, y);
                let r = p[0] as i32;
                let g = p[1] as i32;
                let b = p[2] as i32;
                let is_skin = r > 95 && g > 40 && b > 20
                    && (r - g) > 15
                    && r > b
                    && (r.max(g).max(b) - r.min(g).min(b)) > 18;
                if is_skin {
                    out.put_pixel(x, y, image::Rgba([255, 255, 255, p[3]]));
                }
            }
        }
        out
    }

    /// Flattens vertical page curvature typical of open books by tracking dark-text
    /// vertical centroids across 8 horizontal bands, fitting a smooth parabolic offset,
    /// and unwarping each column with bilinear interpolation.
    pub fn dewarp_book_rgba(image: &RgbaImage) -> RgbaImage {
        let (w, h) = image.dimensions();
        if w < 160 || h < 160 {
            return image.clone();
        }
        let raw = image.as_raw();
        let stride = (w as usize) * 4;
        let bands = 8usize;
        let band_w = (w as usize / bands).max(1);
        let y_start = (h as usize) / 8;
        let y_end = (h as usize) * 7 / 8;

        let mut band_centers = vec![0.0f32; bands];
        let mut band_weights = vec![0.0f32; bands];
        for b in 0..bands {
            let x0 = b * band_w;
            let x1 = if b + 1 == bands { w as usize } else { x0 + band_w };
            let mut sum_y = 0.0f64;
            let mut cnt = 0.0f64;
            for y in (y_start..y_end).step_by(2) {
                let row = y * stride;
                for x in (x0..x1).step_by(2) {
                    let i = row + x * 4;
                    let luma = (raw[i] as u32 * 77 + raw[i + 1] as u32 * 150 + raw[i + 2] as u32 * 29) >> 8;
                    if luma < 145 {
                        sum_y += y as f64;
                        cnt += 1.0;
                    }
                }
            }
            if cnt > 20.0 {
                band_centers[b] = (sum_y / cnt) as f32;
                band_weights[b] = cnt as f32;
            }
        }

        let valid_centers: Vec<f32> = band_centers
            .iter()
            .zip(band_weights.iter())
            .filter(|(_, &wt)| wt > 0.0)
            .map(|(&c, _)| c)
            .collect();
        if valid_centers.len() < 4 {
            return image.clone();
        }
        let ref_y = valid_centers.iter().sum::<f32>() / valid_centers.len() as f32;

        let max_shift = h as f32 * 0.04;
        let shifts: Vec<f32> = (0..bands)
            .map(|b| {
                if band_weights[b] > 0.0 {
                    (band_centers[b] - ref_y).clamp(-max_shift, max_shift)
                } else {
                    0.0
                }
            })
            .collect();

        let w_f = w as f32;
        let h_f = h as f32;
        let mut out = vec![255u8; (w as usize) * (h as usize) * 4];

        for x in 0..w {
            let pos = (x as f32 / w_f) * (bands - 1) as f32;
            let b0 = (pos.floor() as usize).min(bands - 1);
            let b1 = (b0 + 1).min(bands - 1);
            let frac = pos - b0 as f32;
            let dy = shifts[b0] * (1.0 - frac) + shifts[b1] * frac;

            for y in 0..h {
                let sy = (y as f32 + dy).clamp(0.0, h_f - 1.001);
                let y0 = sy as usize;
                let fy = sy - y0 as f32;
                let i0 = y0 * stride + (x as usize) * 4;
                let i1 = (y0 + 1).min(h as usize - 1) * stride + (x as usize) * 4;
                let dst = (y as usize) * stride + (x as usize) * 4;
                for c in 0..4 {
                    out[dst + c] = ((1.0 - fy) * raw[i0 + c] as f32 + fy * raw[i1 + c] as f32)
                        .clamp(0.0, 255.0) as u8;
                }
            }
        }

        RgbaImage::from_raw(w, h, out).unwrap_or_else(|| image.clone())
    }

    fn downscale_dims(w: usize, h: usize) -> (usize, usize) {
        let max_side = w.max(h) as f32;
        let scale = (140.0 / max_side).min(1.0);
        let bw = ((w as f32 * scale).round() as usize).max(4);
        let bh = ((h as f32 * scale).round() as usize).max(4);
        (bw, bh)
    }

    fn estimate_luma_background(luma: &[u8], w: usize, h: usize) -> (usize, usize, Vec<f32>) {
        let (bw, bh) = Self::downscale_dims(w, h);
        let mut grid = vec![0.0f32; bw * bh];
        for by in 0..bh {
            let sy = (by * h / bh).min(h - 1);
            for bx in 0..bw {
                let sx = (bx * w / bw).min(w - 1);
                grid[by * bw + bx] = luma[sy * w + sx] as f32;
            }
        }
        let dilated = Self::separable_max_filter(&grid, bw, bh, 5);
        let smoothed = Self::separable_box_blur(&dilated, bw, bh, 5);
        (bw, bh, smoothed)
    }

    fn estimate_rgb_background(raw: &[u8], w: usize, h: usize) -> (usize, usize, Vec<[f32; 3]>) {
        let (bw, bh) = Self::downscale_dims(w, h);
        let mut r_grid = vec![0.0f32; bw * bh];
        let mut g_grid = vec![0.0f32; bw * bh];
        let mut b_grid = vec![0.0f32; bw * bh];
        for by in 0..bh {
            let sy = (by * h / bh).min(h - 1);
            for bx in 0..bw {
                let sx = (bx * w / bw).min(w - 1);
                let idx = (sy * w + sx) * 4;
                let g_idx = by * bw + bx;
                r_grid[g_idx] = raw[idx] as f32;
                g_grid[g_idx] = raw[idx + 1] as f32;
                b_grid[g_idx] = raw[idx + 2] as f32;
            }
        }
        let r_s = Self::separable_box_blur(&Self::separable_max_filter(&r_grid, bw, bh, 5), bw, bh, 5);
        let g_s = Self::separable_box_blur(&Self::separable_max_filter(&g_grid, bw, bh, 5), bw, bh, 5);
        let b_s = Self::separable_box_blur(&Self::separable_max_filter(&b_grid, bw, bh, 5), bw, bh, 5);
        let merged = (0..bw * bh).map(|i| [r_s[i], g_s[i], b_s[i]]).collect();
        (bw, bh, merged)
    }

    fn separable_max_filter(src: &[f32], w: usize, h: usize, radius: usize) -> Vec<f32> {
        let mut horiz = vec![0.0f32; w * h];
        for y in 0..h {
            let row = y * w;
            for x in 0..w {
                let x0 = x.saturating_sub(radius);
                let x1 = (x + radius).min(w - 1);
                let mut m = 0.0f32;
                for xx in x0..=x1 {
                    m = m.max(src[row + xx]);
                }
                horiz[row + x] = m;
            }
        }
        let mut out = vec![0.0f32; w * h];
        for y in 0..h {
            let y0 = y.saturating_sub(radius);
            let y1 = (y + radius).min(h - 1);
            for x in 0..w {
                let mut m = 0.0f32;
                for yy in y0..=y1 {
                    m = m.max(horiz[yy * w + x]);
                }
                out[y * w + x] = m;
            }
        }
        out
    }

    fn separable_box_blur(src: &[f32], w: usize, h: usize, radius: usize) -> Vec<f32> {
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
                horiz[row + x] = sum / ((x1 - x0 + 1) as f32);
            }
        }
        let mut out = vec![0.0f32; w * h];
        for y in 0..h {
            let y0 = y.saturating_sub(radius);
            let y1 = (y + radius).min(h - 1);
            let count = (y1 - y0 + 1) as f32;
            for x in 0..w {
                let mut sum = 0.0f32;
                for yy in y0..=y1 {
                    sum += horiz[yy * w + x];
                }
                out[y * w + x] = sum / count;
            }
        }
        out
    }

    fn sample_bg_scalar(bg: &[f32], bw: usize, bh: usize, x: usize, y: usize, w: usize, h: usize) -> f32 {
        let fx = (x as f32 / w.max(1) as f32) * (bw - 1) as f32;
        let fy = (y as f32 / h.max(1) as f32) * (bh - 1) as f32;
        let x0 = (fx as usize).min(bw - 1);
        let y0 = (fy as usize).min(bh - 1);
        let x1 = (x0 + 1).min(bw - 1);
        let y1 = (y0 + 1).min(bh - 1);
        let tx = fx - x0 as f32;
        let ty = fy - y0 as f32;
        let top = bg[y0 * bw + x0] * (1.0 - tx) + bg[y0 * bw + x1] * tx;
        let bot = bg[y1 * bw + x0] * (1.0 - tx) + bg[y1 * bw + x1] * tx;
        top * (1.0 - ty) + bot * ty
    }

    fn sample_bg_rgb(bg: &[[f32; 3]], bw: usize, bh: usize, x: usize, y: usize, w: usize, h: usize) -> (f32, f32, f32) {
        let fx = (x as f32 / w.max(1) as f32) * (bw - 1) as f32;
        let fy = (y as f32 / h.max(1) as f32) * (bh - 1) as f32;
        let x0 = (fx as usize).min(bw - 1);
        let y0 = (fy as usize).min(bh - 1);
        let x1 = (x0 + 1).min(bw - 1);
        let y1 = (y0 + 1).min(bh - 1);
        let tx = fx - x0 as f32;
        let ty = fy - y0 as f32;
        let p00 = bg[y0 * bw + x0];
        let p10 = bg[y0 * bw + x1];
        let p01 = bg[y1 * bw + x0];
        let p11 = bg[y1 * bw + x1];
        let r = (p00[0] * (1.0 - tx) + p10[0] * tx) * (1.0 - ty) + (p01[0] * (1.0 - tx) + p11[0] * tx) * ty;
        let g = (p00[1] * (1.0 - tx) + p10[1] * tx) * (1.0 - ty) + (p01[1] * (1.0 - tx) + p11[1] * tx) * ty;
        let b = (p00[2] * (1.0 - tx) + p10[2] * tx) * (1.0 - ty) + (p01[2] * (1.0 - tx) + p11[2] * tx) * ty;
        (r, g, b)
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use image::Rgba;

    #[test]
    fn clean_filter_removes_shadow_while_preserving_text() {
        let mut img = RgbaImage::new(120, 120);
        for y in 0..120 {
            for x in 0..120 {
                // Left half bright paper (220), right half shadowed paper (105)
                let paper = if x < 60 { 220 } else { 105 };
                let is_text = (x == 30 || x == 90) && (40..80).contains(&y);
                let v = if is_text { 25 } else { paper };
                img.put_pixel(x, y, Rgba([v, v, v, 255]));
            }
        }
        let cleaned = DocumentScanner::clean_document_filter(&img, 1.2);
        // Both bright and shadowed paper should be whitened
        assert!(cleaned.get_pixel(15, 60)[0] >= 245);
        assert!(cleaned.get_pixel(105, 60)[0] >= 240);
        // Text in shadowed area should remain dark
        assert!(cleaned.get_pixel(90, 60)[0] < 110);
    }

    #[test]
    fn magic_color_white_balances_warm_paper() {
        let img = RgbaImage::from_pixel(80, 80, Rgba([220, 195, 145, 255]));
        let magic = DocumentScanner::magic_color_filter(&img);
        let px = magic.get_pixel(40, 40);
        assert!(px[0] >= 250 && px[1] >= 250 && px[2] >= 250);
    }

    #[test]
    fn margin_finger_cleanup_whitens_skin_on_edge() {
        let mut img = RgbaImage::from_pixel(200, 200, Rgba([255, 255, 255, 255]));
        // Skin-toned thumb on left 5% margin
        for y in 80..120 {
            for x in 0..10 {
                img.put_pixel(x, y, Rgba([195, 130, 105, 255]));
            }
        }
        let cleaned = DocumentScanner::remove_margin_fingers(&img);
        assert_eq!(cleaned.get_pixel(5, 100)[0], 255);
    }

    #[test]
    fn deskew_straightens_slightly_tilted_lines() {
        let mut img = RgbaImage::from_pixel(240, 240, Rgba([255, 255, 255, 255]));
        // Draw tilted dark text lines at ~3 degrees
        let slope = 3.0f32.to_radians().tan();
        for base_y in (40..200).step_by(24) {
            for x in 40..200 {
                let y = (base_y as f32 + (x as f32 - 120.0) * slope).round() as u32;
                if y < 238 {
                    img.put_pixel(x, y, Rgba([20, 20, 20, 255]));
                    img.put_pixel(x, y + 1, Rgba([20, 20, 20, 255]));
                }
            }
        }
        let deskewed = DocumentScanner::deskew_rgba(&img);
        assert_eq!(deskewed.dimensions(), (240, 240));
    }

    #[test]
    fn dewarp_book_preserves_dimensions_on_curved_lines() {
        let mut img = RgbaImage::from_pixel(240, 240, Rgba([255, 255, 255, 255]));
        for x in 20..220 {
            let norm = (x as f32 - 120.0) / 100.0;
            let curve = (norm * norm) * 8.0;
            let y = (120.0 + curve).round() as u32;
            img.put_pixel(x, y, Rgba([20, 20, 20, 255]));
            img.put_pixel(x, y + 1, Rgba([20, 20, 20, 255]));
        }
        let dewarped = DocumentScanner::dewarp_book_rgba(&img);
        assert_eq!(dewarped.dimensions(), (240, 240));
    }
}
