use image::{DynamicImage, GrayImage, RgbaImage};

use crate::geometry::{HomographyMatrix, Point2D, QuadCorners};
use otium_core::{OtiumError, Result};

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

        let total_pixels = (dst_w as usize) * (dst_h as usize);
        let mut out_buffer: Vec<u8> = vec![255u8; total_pixels * 4];

        for y in 0..dst_h {
            let row_offset = (y as usize) * (dst_w as usize) * 4;

            for x in 0..dst_w {
                let pixel_offset = row_offset + (x as usize) * 4;
                let src_pt = homography.transform_point(Point2D::new(x as f32, y as f32));
                let sx = src_pt.x;
                let sy = src_pt.y;

                if sx >= 0.0 && sx < max_x_bound && sy >= 0.0 && sy < max_y_bound {
                    let x0 = sx as usize;
                    let y0 = sy as usize;

                    let fx = sx - (x0 as f32);
                    let fy = sy - (y0 as f32);
                    let inv_fx = 1.0 - fx;
                    let inv_fy = 1.0 - fy;

                    let [idx00, idx10, idx01, idx11] =
                        otium_scan_math::rgba_neighbors(x0, y0, src_stride);

                    for c in 0..4 {
                        let p00 = src_raw[idx00 + c] as f32;
                        let p10 = src_raw[idx10 + c] as f32;
                        let p01 = src_raw[idx01 + c] as f32;
                        let p11 = src_raw[idx11 + c] as f32;

                        let top = inv_fx * p00 + fx * p10;
                        let bottom = inv_fx * p01 + fx * p11;
                        let val = inv_fy * top + fy * bottom;

                        out_buffer[pixel_offset + c] = val.clamp(0.0, 255.0) as u8;
                    }
                } else {
                    // Border / out of bounds pixels set to white
                    out_buffer[pixel_offset] = 255;
                    out_buffer[pixel_offset + 1] = 255;
                    out_buffer[pixel_offset + 2] = 255;
                    out_buffer[pixel_offset + 3] = 255;
                }
            }
        }

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
}
