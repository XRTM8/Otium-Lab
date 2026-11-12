use core::slice;

use crate::memory::{clamp_u8, MAX_PIXELS};

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
        for (row, a_row) in a.iter().enumerate().skip(col + 1) {
            let v = a_row[col].abs();
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
        let pivot_row = a[col];
        for row in (col + 1)..8 {
            let factor = a[row][col] / diag;
            if factor != 0.0 {
                for (dst_cell, pivot_cell) in a[row][col..].iter_mut().zip(&pivot_row[col..]) {
                    *dst_cell -= factor * *pivot_cell;
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

/// Performs perspective warp from `src_ptr` onto `dst_ptr` using 4 quad corner coordinates.
///
/// # Safety
/// `src_ptr`, `dst_ptr`, and `corners_ptr` must be valid for `src_w * src_h * 4`, `dst_w * dst_h * 4`, and `8` elements respectively.
#[no_mangle]
pub unsafe extern "C" fn otium_warp_perspective_rgba(
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

/// Flattens curved book spine distortion vertically along `spine_pos`.
///
/// # Safety
/// `src_ptr` and `dst_ptr` must be valid for `width * height * 4` bytes.
#[no_mangle]
pub unsafe extern "C" fn otium_dewarp_spine_rgba(
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
