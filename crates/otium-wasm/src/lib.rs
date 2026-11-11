use core::slice;
use std::alloc::{alloc, dealloc, Layout};

const ALIGN: usize = 16;
const MAX_PIXELS: usize = 64_000_000;

/// Allocates 16-byte aligned memory in linear WASM space for zero-copy JS interop.
#[no_mangle]
pub extern "C" fn otium_alloc(size: usize) -> *mut u8 {
    if size == 0 || size > MAX_PIXELS * 4 {
        return core::ptr::null_mut();
    }
    let Ok(layout) = Layout::from_size_align(size, ALIGN) else {
        return core::ptr::null_mut();
    };
    unsafe { alloc(layout) }
}

/// Frees memory previously returned by `otium_alloc`.
#[no_mangle]
pub extern "C" fn otium_dealloc(ptr: *mut u8, size: usize) {
    if ptr.is_null() || size == 0 || size > MAX_PIXELS * 4 {
        return;
    }
    if let Ok(layout) = Layout::from_size_align(size, ALIGN) {
        unsafe { dealloc(ptr, layout) };
    }
}

#[inline(always)]
fn clamp_u8(v: f32) -> u8 {
    if v <= 0.0 {
        0
    } else if v >= 255.0 {
        255
    } else {
        (v + 0.5) as u8
    }
}

#[inline(always)]
fn smoothstep01(t: f32) -> f32 {
    let x = t.clamp(0.0, 1.0);
    x * x * (3.0 - 2.0 * x)
}

fn compute_illumination_grid(
    rgba: &[u8],
    width: usize,
    height: usize,
    step: usize,
) -> (Vec<f32>, usize, usize) {
    let grid_w = width.div_ceil(step);
    let grid_h = height.div_ceil(step);
    let mut raw = vec![50.0f32; grid_w * grid_h];

    for gy in 0..grid_h {
        let y0 = gy * step;
        let y1 = (y0 + step).min(height);
        for gx in 0..grid_w {
            let x0 = gx * step;
            let x1 = (x0 + step).min(width);
            let mut max_lum = 0.0f32;

            let mut y = y0;
            while y < y1 {
                let row = y * width;
                let mut x = x0;
                while x < x1 {
                    let idx = (row + x) * 4;
                    let lum = 0.299 * (rgba[idx] as f32)
                        + 0.587 * (rgba[idx + 1] as f32)
                        + 0.114 * (rgba[idx + 2] as f32);
                    if lum > max_lum {
                        max_lum = lum;
                    }
                    x += 2;
                }
                y += 2;
            }
            raw[gy * grid_w + gx] = max_lum.max(50.0);
        }
    }

    let mut pass1 = vec![0.0f32; grid_w * grid_h];
    for gy in 0..grid_h {
        let row = gy * grid_w;
        for gx in 0..grid_w {
            let prev = raw[row + gx.saturating_sub(1)];
            let curr = raw[row + gx];
            let next = raw[row + (gx + 1).min(grid_w - 1)];
            pass1[row + gx] = 0.25 * prev + 0.5 * curr + 0.25 * next;
        }
    }

    let mut pass2 = vec![0.0f32; grid_w * grid_h];
    for gy in 0..grid_h {
        let prev_row = gy.saturating_sub(1) * grid_w;
        let curr_row = gy * grid_w;
        let next_row = (gy + 1).min(grid_h - 1) * grid_w;
        for gx in 0..grid_w {
            pass2[curr_row + gx] = 0.25 * pass1[prev_row + gx]
                + 0.5 * pass1[curr_row + gx]
                + 0.25 * pass1[next_row + gx];
        }
    }

    (pass2, grid_w, grid_h)
}

#[inline(always)]
fn sample_grid(grid: &[f32], grid_w: usize, grid_h: usize, x: usize, y: usize, step: usize) -> f32 {
    let gx_f = (x as f32) / (step as f32);
    let gy_f = (y as f32) / (step as f32);
    let gx0 = (gx_f as usize).min(grid_w - 1);
    let gy0 = (gy_f as usize).min(grid_h - 1);
    let gx1 = (gx0 + 1).min(grid_w - 1);
    let gy1 = (gy0 + 1).min(grid_h - 1);
    let tx = gx_f - (gx0 as f32);
    let ty = gy_f - (gy0 as f32);

    let b00 = grid[gy0 * grid_w + gx0];
    let b10 = grid[gy0 * grid_w + gx1];
    let b01 = grid[gy1 * grid_w + gx0];
    let b11 = grid[gy1 * grid_w + gx1];

    (b00 * (1.0 - tx) + b10 * tx) * (1.0 - ty) + (b01 * (1.0 - tx) + b11 * tx) * ty
}

fn unsharp_mask_rgba(rgba: &mut [u8], width: usize, height: usize, amount: f32) {
    if width < 3 || height < 3 {
        return;
    }
    let copy = rgba.to_vec();
    let row_stride = width * 4;

    for y in 1..(height - 1) {
        let row = y * row_stride;
        let prev_row = row - row_stride;
        let next_row = row + row_stride;
        for x in 1..(width - 1) {
            let idx = row + x * 4;
            let lum = 0.299 * (copy[idx] as f32)
                + 0.587 * (copy[idx + 1] as f32)
                + 0.114 * (copy[idx + 2] as f32);
            if lum > 250.0 {
                continue;
            }
            let left = idx - 4;
            let right = idx + 4;
            let up = prev_row + x * 4;
            let down = next_row + x * 4;

            for c in 0..3 {
                let val = copy[idx + c] as f32;
                let lap = 4.0 * val
                    - (copy[left + c] as f32)
                    - (copy[right + c] as f32)
                    - (copy[up + c] as f32)
                    - (copy[down + c] as f32);
                rgba[idx + c] = clamp_u8(val + lap * amount);
            }
        }
    }
}

pub fn apply_filter_rgba_slice(rgba: &mut [u8], width: usize, height: usize, filter_id: u32) -> bool {
    let min_dim = width.min(height);
    if min_dim == 0 || rgba.len() < width * height * 4 {
        return false;
    }

    match filter_id {
        // 1 = magic, 5 = grayscale (magic + desaturate + unsharp)
        1 | 5 => {
            let step = (min_dim / 24).clamp(24, 64);
            let (grid, gw, gh) = compute_illumination_grid(rgba, width, height, step);
            for y in 0..height {
                for x in 0..width {
                    let bg_lum = sample_grid(&grid, gw, gh, x, y, step);
                    let idx = (y * width + x) * 4;
                    let r = rgba[idx] as f32;
                    let g = rgba[idx + 1] as f32;
                    let b = rgba[idx + 2] as f32;

                    let scale = 255.0 / bg_lum.max(38.0);
                    let mut nr = r * scale;
                    let mut ng = g * scale;
                    let mut nb = b * scale;

                    let lum = 0.299 * nr + 0.587 * ng + 0.114 * nb;
                    let chroma = r.max(g).max(b) - r.min(g).min(b);
                    let bg_ratio = lum / 255.0;

                    if chroma > 18.0 && bg_ratio < 0.92 {
                        let mean = (nr + ng + nb) / 3.0;
                        nr = mean + (nr - mean) * 1.35;
                        ng = mean + (ng - mean) * 1.35;
                        nb = mean + (nb - mean) * 1.35;
                    } else if bg_ratio >= 0.82 {
                        let h = smoothstep01((bg_ratio - 0.82) / 0.18);
                        nr = nr * (1.0 - h) + 255.0 * h;
                        ng = ng * (1.0 - h) + 255.0 * h;
                        nb = nb * (1.0 - h) + 255.0 * h;
                    } else if bg_ratio < 0.65 {
                        let ink = (bg_ratio / 0.65).max(0.0).powf(0.50);
                        nr *= ink;
                        ng *= ink;
                        nb *= ink;
                    }

                    if filter_id == 5 {
                        let gray = 0.299 * nr + 0.587 * ng + 0.114 * nb;
                        let g_u8 = clamp_u8(gray);
                        rgba[idx] = g_u8;
                        rgba[idx + 1] = g_u8;
                        rgba[idx + 2] = g_u8;
                    } else {
                        rgba[idx] = clamp_u8(nr);
                        rgba[idx + 1] = clamp_u8(ng);
                        rgba[idx + 2] = clamp_u8(nb);
                    }
                }
            }
            unsharp_mask_rgba(rgba, width, height, 0.45);
            true
        }
        // 2 = clean
        2 => {
            let step = (min_dim / 32).clamp(16, 48);
            let (grid, gw, gh) = compute_illumination_grid(rgba, width, height, step);
            for y in 0..height {
                for x in 0..width {
                    let bg_lum = sample_grid(&grid, gw, gh, x, y, step);
                    let idx = (y * width + x) * 4;
                    let r = rgba[idx] as f32;
                    let g = rgba[idx + 1] as f32;
                    let b = rgba[idx + 2] as f32;

                    let scale = 255.0 / bg_lum.max(35.0);
                    let mut nr = r * scale;
                    let mut ng = g * scale;
                    let mut nb = b * scale;

                    let lum = 0.299 * nr + 0.587 * ng + 0.114 * nb;
                    let chroma = r.max(g).max(b) - r.min(g).min(b);
                    let bg_ratio = lum / 255.0;

                    if chroma > 18.0 && bg_ratio < 0.90 {
                        let mean = (nr + ng + nb) / 3.0;
                        nr = mean + (nr - mean) * 1.40;
                        ng = mean + (ng - mean) * 1.40;
                        nb = mean + (nb - mean) * 1.40;
                    } else if bg_ratio >= 0.78 {
                        let h = smoothstep01((bg_ratio - 0.78) / 0.22);
                        nr = nr * (1.0 - h) + 255.0 * h;
                        ng = ng * (1.0 - h) + 255.0 * h;
                        nb = nb * (1.0 - h) + 255.0 * h;
                    } else if bg_ratio < 0.60 {
                        let ink = (bg_ratio / 0.60).max(0.0).powf(0.65);
                        nr *= ink;
                        ng *= ink;
                        nb *= ink;
                    }

                    rgba[idx] = clamp_u8(nr);
                    rgba[idx + 1] = clamp_u8(ng);
                    rgba[idx + 2] = clamp_u8(nb);
                }
            }
            unsharp_mask_rgba(rgba, width, height, 0.55);
            true
        }
        // 3 = vibrant
        3 => {
            let step = (min_dim / 32).clamp(16, 48);
            let (grid, gw, gh) = compute_illumination_grid(rgba, width, height, step);
            for y in 0..height {
                for x in 0..width {
                    let bg_lum = sample_grid(&grid, gw, gh, x, y, step);
                    let idx = (y * width + x) * 4;
                    let r = rgba[idx] as f32;
                    let g = rgba[idx + 1] as f32;
                    let b = rgba[idx + 2] as f32;

                    let scale = 255.0 / bg_lum.max(40.0);
                    let mut nr = r * scale;
                    let mut ng = g * scale;
                    let mut nb = b * scale;

                    let lum = 0.299 * nr + 0.587 * ng + 0.114 * nb;
                    let chroma = r.max(g).max(b) - r.min(g).min(b);
                    let bg_ratio = lum / 255.0;

                    if chroma > 15.0 {
                        let mean = (nr + ng + nb) / 3.0;
                        nr = mean + (nr - mean) * 1.45;
                        ng = mean + (ng - mean) * 1.45;
                        nb = mean + (nb - mean) * 1.45;
                    }
                    if bg_ratio >= 0.86 {
                        let h = smoothstep01((bg_ratio - 0.86) / 0.14);
                        nr = nr * (1.0 - h) + 255.0 * h;
                        ng = ng * (1.0 - h) + 255.0 * h;
                        nb = nb * (1.0 - h) + 255.0 * h;
                    }

                    rgba[idx] = clamp_u8(nr);
                    rgba[idx + 1] = clamp_u8(ng);
                    rgba[idx + 2] = clamp_u8(nb);
                }
            }
            unsharp_mask_rgba(rgba, width, height, 0.35);
            true
        }
        // 4 = bw + despeckle
        4 => {
            let step = (min_dim / 32).clamp(16, 48);
            let (grid, gw, gh) = compute_illumination_grid(rgba, width, height, step);
            for y in 0..height {
                for x in 0..width {
                    let bg_lum = sample_grid(&grid, gw, gh, x, y, step);
                    let idx = (y * width + x) * 4;
                    let lum = 0.299 * (rgba[idx] as f32)
                        + 0.587 * (rgba[idx + 1] as f32)
                        + 0.114 * (rgba[idx + 2] as f32);
                    let val = if lum < bg_lum * 0.82 { 0 } else { 255 };
                    rgba[idx] = val;
                    rgba[idx + 1] = val;
                    rgba[idx + 2] = val;
                }
            }
            if width >= 3 && height >= 3 {
                let row_stride = width * 4;
                for y in 1..(height - 1) {
                    let row = y * row_stride;
                    let prev_row = row - row_stride;
                    let next_row = row + row_stride;
                    for x in 1..(width - 1) {
                        let idx = row + x * 4;
                        if rgba[idx] == 0
                            && rgba[prev_row + x * 4] == 255
                            && rgba[next_row + x * 4] == 255
                            && rgba[idx - 4] == 255
                            && rgba[idx + 4] == 255
                        {
                            rgba[idx] = 255;
                            rgba[idx + 1] = 255;
                            rgba[idx + 2] = 255;
                        }
                    }
                }
            }
            true
        }
        // 6 = vintage
        6 => {
            let step = (min_dim / 32).clamp(16, 48);
            let (grid, gw, gh) = compute_illumination_grid(rgba, width, height, step);
            for y in 0..height {
                for x in 0..width {
                    let bg_lum = sample_grid(&grid, gw, gh, x, y, step);
                    let idx = (y * width + x) * 4;
                    let r = rgba[idx] as f32;
                    let g = rgba[idx + 1] as f32;
                    let mut b = rgba[idx + 2] as f32;

                    let rg_avg = (r + g) * 0.5;
                    if rg_avg > b + 20.0 {
                        b = (b + (rg_avg - b) * 0.75).min(255.0);
                    }

                    let scale = 255.0 / bg_lum.max(36.0);
                    let mut nr = r * scale;
                    let mut ng = g * scale;
                    let mut nb = b * scale;

                    let lum = 0.299 * nr + 0.587 * ng + 0.114 * nb;
                    let bg_ratio = lum / 255.0;

                    if bg_ratio >= 0.82 {
                        let h = smoothstep01((bg_ratio - 0.82) / 0.18);
                        nr = nr * (1.0 - h) + 255.0 * h;
                        ng = ng * (1.0 - h) + 255.0 * h;
                        nb = nb * (1.0 - h) + 255.0 * h;
                    } else if bg_ratio < 0.65 {
                        let factor = (bg_ratio / 0.65).max(0.0).powf(0.55);
                        nr *= factor;
                        ng *= factor;
                        nb *= factor;
                    }

                    rgba[idx] = clamp_u8(nr);
                    rgba[idx + 1] = clamp_u8(ng);
                    rgba[idx + 2] = clamp_u8(nb);
                }
            }
            unsharp_mask_rgba(rgba, width, height, 0.40);
            true
        }
        _ => false,
    }
}

#[no_mangle]
pub extern "C" fn otium_apply_filter_rgba(
    ptr: *mut u8,
    width: u32,
    height: u32,
    filter_id: u32,
) -> i32 {
    if ptr.is_null() || width == 0 || height == 0 {
        return -1;
    }
    let Some(pixels) = (width as usize).checked_mul(height as usize) else {
        return -1;
    };
    if pixels > MAX_PIXELS {
        return -1;
    }
    let rgba = unsafe { slice::from_raw_parts_mut(ptr, pixels * 4) };
    if apply_filter_rgba_slice(rgba, width as usize, height as usize, filter_id) {
        0
    } else {
        -1
    }
}

fn compute_inverse_homography(dst_w: f64, dst_h: f64, corners: &[f32; 8]) -> Option<[f64; 9]> {
    let src = [
        (0.0f64, 0.0f64),
        (dst_w, 0.0f64),
        (dst_w, dst_h),
        (0.0f64, dst_h),
    ];
    let dst = [
        (corners[0] as f64, corners[1] as f64),
        (corners[2] as f64, corners[3] as f64),
        (corners[4] as f64, corners[5] as f64),
        (corners[6] as f64, corners[7] as f64),
    ];

    let mut a = [[0.0f64; 8]; 8];
    let mut b = [0.0f64; 8];

    for i in 0..4 {
        let (sx, sy) = src[i];
        let (dx, dy) = dst[i];
        let r1 = i * 2;
        a[r1] = [sx, sy, 1.0, 0.0, 0.0, 0.0, -dx * sx, -dx * sy];
        b[r1] = dx;
        let r2 = r1 + 1;
        a[r2] = [0.0, 0.0, 0.0, sx, sy, 1.0, -dy * sx, -dy * sy];
        b[r2] = dy;
    }

    for col in 0..8 {
        let mut pivot = col;
        let mut max_val = a[col][col].abs();
        for row in (col + 1)..8 {
            let v = a[row][col].abs();
            if v > max_val {
                max_val = v;
                pivot = row;
            }
        }
        if max_val < 1e-10 {
            return None;
        }
        if pivot != col {
            a.swap(col, pivot);
            b.swap(col, pivot);
        }
        let diag = a[col][col];
        for row in (col + 1)..8 {
            let factor = a[row][col] / diag;
            if factor != 0.0 {
                for k in col..8 {
                    a[row][k] -= factor * a[col][k];
                }
                b[row] -= factor * b[col];
            }
        }
    }

    let mut h = [0.0f64; 8];
    for row in (0..8).rev() {
        let mut sum = b[row];
        for k in (row + 1)..8 {
            sum -= a[row][k] * h[k];
        }
        h[row] = sum / a[row][row];
    }

    Some([h[0], h[1], h[2], h[3], h[4], h[5], h[6], h[7], 1.0])
}

pub fn warp_perspective_rgba_slice(
    src: &[u8],
    src_w: usize,
    src_h: usize,
    dst: &mut [u8],
    dst_w: usize,
    dst_h: usize,
    corners: &[f32; 8],
) -> bool {
    if src_w < 2 || src_h < 2 || dst_w == 0 || dst_h == 0 {
        return false;
    }
    if src.len() < src_w * src_h * 4 || dst.len() < dst_w * dst_h * 4 {
        return false;
    }
    let Some(m) = compute_inverse_homography(dst_w as f64, dst_h as f64, corners) else {
        return false;
    };

    let src_stride = src_w * 4;
    let max_x = (src_w - 1) as f32;
    let max_y = (src_h - 1) as f32;

    for y in 0..dst_h {
        let yf = y as f64;
        let row_offset = y * dst_w * 4;
        for x in 0..dst_w {
            let xf = x as f64;
            let z = m[6] * xf + m[7] * yf + m[8];
            let safe_z = if z.abs() < 1e-8 { 1e-8 } else { z };
            let inv_z = 1.0 / safe_z;
            let sx = ((m[0] * xf + m[1] * yf + m[2]) * inv_z) as f32;
            let sy = ((m[3] * xf + m[4] * yf + m[5]) * inv_z) as f32;
            let out_idx = row_offset + x * 4;

            if sx >= 0.0 && sx <= max_x && sy >= 0.0 && sy <= max_y {
                let x0 = (sx as usize).min(src_w - 2);
                let y0 = (sy as usize).min(src_h - 2);
                let fx = (sx - (x0 as f32)).clamp(0.0, 1.0);
                let fy = (sy - (y0 as f32)).clamp(0.0, 1.0);
                let inv_fx = 1.0 - fx;
                let inv_fy = 1.0 - fy;

                let idx00 = y0 * src_stride + x0 * 4;
                let idx10 = idx00 + 4;
                let idx01 = idx00 + src_stride;
                let idx11 = idx01 + 4;

                let w00 = inv_fx * inv_fy;
                let w10 = fx * inv_fy;
                let w01 = inv_fx * fy;
                let w11 = fx * fy;

                for c in 0..3 {
                    let v = (src[idx00 + c] as f32) * w00
                        + (src[idx10 + c] as f32) * w10
                        + (src[idx01 + c] as f32) * w01
                        + (src[idx11 + c] as f32) * w11;
                    dst[out_idx + c] = clamp_u8(v);
                }
                dst[out_idx + 3] = 255;
            } else {
                dst[out_idx] = 255;
                dst[out_idx + 1] = 255;
                dst[out_idx + 2] = 255;
                dst[out_idx + 3] = 255;
            }
        }
    }
    true
}

#[no_mangle]
pub extern "C" fn otium_warp_perspective_rgba(
    src_ptr: *const u8,
    src_w: u32,
    src_h: u32,
    dst_ptr: *mut u8,
    dst_w: u32,
    dst_h: u32,
    corners_ptr: *const f32,
) -> i32 {
    if src_ptr.is_null() || dst_ptr.is_null() || corners_ptr.is_null() {
        return -1;
    }
    let Some(src_pixels) = (src_w as usize).checked_mul(src_h as usize) else {
        return -1;
    };
    let Some(dst_pixels) = (dst_w as usize).checked_mul(dst_h as usize) else {
        return -1;
    };
    if src_pixels > MAX_PIXELS || dst_pixels > MAX_PIXELS {
        return -1;
    }
    let src = unsafe { slice::from_raw_parts(src_ptr, src_pixels * 4) };
    let dst = unsafe { slice::from_raw_parts_mut(dst_ptr, dst_pixels * 4) };
    let corners_slice = unsafe { slice::from_raw_parts(corners_ptr, 8) };
    let mut corners = [0.0f32; 8];
    corners.copy_from_slice(corners_slice);

    if warp_perspective_rgba_slice(
        src,
        src_w as usize,
        src_h as usize,
        dst,
        dst_w as usize,
        dst_h as usize,
        &corners,
    ) {
        0
    } else {
        -1
    }
}

pub fn dewarp_spine_rgba_slice(
    src: &[u8],
    width: usize,
    height: usize,
    dst: &mut [u8],
    curvature: f32,
    spine_pos: f32,
) -> bool {
    if width == 0 || height < 2 || src.len() < width * height * 4 || dst.len() < width * height * 4 {
        return false;
    }
    let h_f = height as f32;
    let w_f = width as f32;
    let max_lift = h_f * 0.1 * curvature.clamp(0.0, 1.0);
    let sigma = 0.35f32;
    let two_sigma2 = 2.0 * sigma * sigma;
    let stride = width * 4;
    let max_y = (height - 1) as f32;

    let mut inv_scales = vec![1.0f32; width];
    let mut dy_offsets = vec![0.0f32; width];
    for x in 0..width {
        let norm_x = (x as f32) / w_f;
        let dist = norm_x - spine_pos;
        let deflection = (-(dist * dist) / two_sigma2).exp() * max_lift;
        let d_height = h_f + deflection;
        dy_offsets[x] = -deflection * 0.5;
        inv_scales[x] = h_f / d_height.max(1.0);
    }

    for y in 0..height {
        let row = y * stride;
        let yf = y as f32;
        for x in 0..width {
            let out_idx = row + x * 4;
            let sy = (yf - dy_offsets[x]) * inv_scales[x];
            if sy >= 0.0 && sy <= max_y {
                let y0 = (sy as usize).min(height - 2);
                let fy = (sy - (y0 as f32)).clamp(0.0, 1.0);
                let inv_fy = 1.0 - fy;
                let idx0 = y0 * stride + x * 4;
                let idx1 = idx0 + stride;
                for c in 0..3 {
                    let v = (src[idx0 + c] as f32) * inv_fy + (src[idx1 + c] as f32) * fy;
                    dst[out_idx + c] = clamp_u8(v);
                }
                dst[out_idx + 3] = 255;
            } else {
                dst[out_idx] = 255;
                dst[out_idx + 1] = 255;
                dst[out_idx + 2] = 255;
                dst[out_idx + 3] = 255;
            }
        }
    }
    true
}

#[no_mangle]
pub extern "C" fn otium_dewarp_spine_rgba(
    src_ptr: *const u8,
    width: u32,
    height: u32,
    dst_ptr: *mut u8,
    curvature: f32,
    spine_pos: f32,
) -> i32 {
    if src_ptr.is_null() || dst_ptr.is_null() || width == 0 || height < 2 {
        return -1;
    }
    let Some(pixels) = (width as usize).checked_mul(height as usize) else {
        return -1;
    };
    if pixels > MAX_PIXELS {
        return -1;
    }
    let src = unsafe { slice::from_raw_parts(src_ptr, pixels * 4) };
    let dst = unsafe { slice::from_raw_parts_mut(dst_ptr, pixels * 4) };
    if dewarp_spine_rgba_slice(src, width as usize, height as usize, dst, curvature, spine_pos) {
        0
    } else {
        -1
    }
}

#[no_mangle]
pub extern "C" fn otium_motion_and_sharpness_rgba(
    rgba_ptr: *const u8,
    prev_lum_ptr: *mut u8,
    has_prev: i32,
    width: u32,
    height: u32,
    out_ptr: *mut f32,
) -> i32 {
    if rgba_ptr.is_null() || prev_lum_ptr.is_null() || out_ptr.is_null() || width < 3 || height < 3
    {
        return -1;
    }
    let pixels = (width as usize) * (height as usize);
    if pixels > MAX_PIXELS {
        return -1;
    }
    let rgba = unsafe { slice::from_raw_parts(rgba_ptr, pixels * 4) };
    let prev_lum = unsafe { slice::from_raw_parts_mut(prev_lum_ptr, pixels) };
    let out = unsafe { slice::from_raw_parts_mut(out_ptr, 2) };

    let mut diff_sum = 0u64;
    let mut diff_count = 0u64;
    for i in 0..pixels {
        let p = i * 4;
        let lum = ((rgba[p] as u32) * 77 + (rgba[p + 1] as u32) * 150 + (rgba[p + 2] as u32) * 29)
            >> 8;
        let lum_u8 = lum as u8;
        if has_prev != 0 && (i & 3) == 0 {
            diff_sum += (lum_u8 as i32 - prev_lum[i] as i32).unsigned_abs() as u64;
            diff_count += 1;
        }
        prev_lum[i] = lum_u8;
    }

    let w = width as usize;
    let h = height as usize;
    let mut sum = 0.0f64;
    let mut sum_sq = 0.0f64;
    let mut lap_count = 0u64;

    for y in 1..(h - 1) {
        let row = y * w;
        for x in 1..(w - 1) {
            let idx = row + x;
            let lap = 4.0 * (prev_lum[idx] as f64)
                - (prev_lum[idx - 1] as f64)
                - (prev_lum[idx + 1] as f64)
                - (prev_lum[idx - w] as f64)
                - (prev_lum[idx + w] as f64);
            sum += lap;
            sum_sq += lap * lap;
            lap_count += 1;
        }
    }

    let motion = if diff_count > 0 {
        (diff_sum as f64 / diff_count as f64) as f32
    } else {
        0.0
    };
    let sharpness = if lap_count > 0 {
        let n = lap_count as f64;
        let mean = sum / n;
        ((sum_sq / n) - mean * mean).max(0.0) as f32
    } else {
        0.0
    };

    out[0] = motion;
    out[1] = sharpness;
    0
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn clean_filter_whitens_paper_and_darkens_ink() {
        let w = 8;
        let h = 8;
        let mut rgba = vec![255u8; w * h * 4];
        // Light gray paper (shadowed ~190) across whole buffer, dark ink pixel in center
        for px in rgba.chunks_exact_mut(4) {
            px[0] = 190;
            px[1] = 190;
            px[2] = 190;
            px[3] = 255;
        }
        let ink = (3 * w + 3) * 4;
        rgba[ink] = 45;
        rgba[ink + 1] = 45;
        rgba[ink + 2] = 45;

        assert!(apply_filter_rgba_slice(&mut rgba, w, h, 2));
        // Background becomes pure white (255), text stays dark (< 110)
        assert_eq!(rgba[0], 255);
        assert!(rgba[ink] < 110);
    }

    #[test]
    fn warp_perspective_preserves_aligned_rectangle() {
        let w = 4usize;
        let h = 4usize;
        let mut src = vec![255u8; w * h * 4];
        // Put colored quadrant at (0,0)
        src[0] = 12;
        src[1] = 34;
        src[2] = 56;
        let mut dst = vec![0u8; w * h * 4];
        let corners = [0.0, 0.0, 4.0, 0.0, 4.0, 4.0, 0.0, 4.0];
        assert!(warp_perspective_rgba_slice(&src, w, h, &mut dst, w, h, &corners));
        assert_eq!(&dst[0..4], &[12, 34, 56, 255]);
    }

    #[test]
    fn dewarp_zero_curvature_is_identity() {
        let w = 4usize;
        let h = 4usize;
        let mut src = vec![0u8; w * h * 4];
        for i in 0..(w * h) {
            src[i * 4] = (i * 11) as u8;
            src[i * 4 + 1] = (i * 7) as u8;
            src[i * 4 + 2] = (i * 3) as u8;
            src[i * 4 + 3] = 255;
        }
        let mut dst = vec![0u8; w * h * 4];
        assert!(dewarp_spine_rgba_slice(&src, w, h, &mut dst, 0.0, 0.5));
        assert_eq!(src, dst);
    }

    #[test]
    fn warp_perspective_handles_trapezoid_projection() {
        let w = 16usize;
        let h = 16usize;
        let mut src = vec![255u8; w * h * 4];
        for y in 6..10 {
            for x in 6..10 {
                let p = (y * w + x) * 4;
                src[p] = 16;
                src[p + 1] = 24;
                src[p + 2] = 32;
            }
        }
        let mut dst = vec![0u8; 8 * 8 * 4];
        let corners = [3.0, 3.0, 13.0, 2.0, 14.0, 13.0, 2.0, 14.0];
        assert!(warp_perspective_rgba_slice(&src, w, h, &mut dst, 8, 8, &corners));
        // Corners of destination correspond to bright paper border
        assert_eq!(dst[3], 255);
        assert!(dst[0] > 200);
        // Center of destination corresponds to the dark interior block
        let mid = (4 * 8 + 4) * 4;
        assert_eq!(dst[mid + 3], 255);
        assert!(dst[mid] < 80);
    }

    #[test]
    fn motion_and_sharpness_computes_stability_and_sharpness() {
        let w = 8u32;
        let h = 8u32;
        let pixels = (w * h) as usize;
        let mut frame = vec![0u8; pixels * 4];
        for y in 0..h {
            for x in 0..w {
                let v = if ((x + y) & 1) == 0 { 240u8 } else { 20u8 };
                let p = ((y * w + x) as usize) * 4;
                frame[p] = v;
                frame[p + 1] = v;
                frame[p + 2] = v;
                frame[p + 3] = 255;
            }
        }
        let mut prev_lum = vec![0u8; pixels];
        let mut metrics = [0.0f32; 2];

        assert_eq!(
            otium_motion_and_sharpness_rgba(
                frame.as_ptr(),
                prev_lum.as_mut_ptr(),
                0,
                w,
                h,
                metrics.as_mut_ptr()
            ),
            0
        );
        assert_eq!(metrics[0], 0.0);
        assert!(metrics[1] > 1000.0);

        // Second pass with identical frame has zero motion
        assert_eq!(
            otium_motion_and_sharpness_rgba(
                frame.as_ptr(),
                prev_lum.as_mut_ptr(),
                1,
                w,
                h,
                metrics.as_mut_ptr()
            ),
            0
        );
        assert!(metrics[0] < 0.01);

        // Inverted frame has large motion
        for px in frame.chunks_exact_mut(4) {
            px[0] = 255 - px[0];
            px[1] = 255 - px[1];
            px[2] = 255 - px[2];
        }
        assert_eq!(
            otium_motion_and_sharpness_rgba(
                frame.as_ptr(),
                prev_lum.as_mut_ptr(),
                1,
                w,
                h,
                metrics.as_mut_ptr()
            ),
            0
        );
        assert!(metrics[0] > 150.0);
    }
}
