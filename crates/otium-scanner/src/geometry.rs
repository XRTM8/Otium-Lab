use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Copy, PartialEq, Serialize, Deserialize)]
pub struct Point2D {
    pub x: f32,
    pub y: f32,
}

impl Point2D {
    pub const fn new(x: f32, y: f32) -> Self {
        Self { x, y }
    }
}

/// A quadrilateral defined by 4 corner points in clockwise order:
/// [Top-Left, Top-Right, Bottom-Right, Bottom-Left]
#[derive(Debug, Clone, Copy, PartialEq, Serialize, Deserialize)]
pub struct QuadCorners {
    pub top_left: Point2D,
    pub top_right: Point2D,
    pub bottom_right: Point2D,
    pub bottom_left: Point2D,
}

impl QuadCorners {
    pub fn new(tl: Point2D, tr: Point2D, br: Point2D, bl: Point2D) -> Self {
        Self {
            top_left: tl,
            top_right: tr,
            bottom_right: br,
            bottom_left: bl,
        }
    }

    /// Calculate estimated target width and height based on Euclidean distance between corners.
    pub fn estimate_target_dimensions(&self) -> (u32, u32) {
        let width_top = ((self.top_right.x - self.top_left.x).powi(2)
            + (self.top_right.y - self.top_left.y).powi(2))
        .sqrt();
        let width_bottom = ((self.bottom_right.x - self.bottom_left.x).powi(2)
            + (self.bottom_right.y - self.bottom_left.y).powi(2))
        .sqrt();
        let target_width = width_top.max(width_bottom).round() as u32;

        let height_left = ((self.bottom_left.x - self.top_left.x).powi(2)
            + (self.bottom_left.y - self.top_left.y).powi(2))
        .sqrt();
        let height_right = ((self.bottom_right.x - self.top_right.x).powi(2)
            + (self.bottom_right.y - self.top_right.y).powi(2))
        .sqrt();
        let target_height = height_left.max(height_right).round() as u32;

        (target_width.max(100), target_height.max(100))
    }
}

/// 3x3 Homography Matrix for 2D Projective Transformations
#[derive(Debug, Clone, Copy)]
pub struct HomographyMatrix {
    pub m: [f32; 9],
}

impl HomographyMatrix {
    /// Compute 3x3 transformation matrix mapping a quad to a destination rectangle (0,0) -> (dst_w, dst_h)
    pub fn from_quad_to_rect(quad: &QuadCorners, dst_w: f32, dst_h: f32) -> Option<Self> {
        let src = [
            quad.top_left,
            quad.top_right,
            quad.bottom_right,
            quad.bottom_left,
        ];
        let dst = [
            Point2D::new(0.0, 0.0),
            Point2D::new(dst_w, 0.0),
            Point2D::new(dst_w, dst_h),
            Point2D::new(0.0, dst_h),
        ];

        Self::compute_homography(&src, &dst)
    }

    /// Compute 3x3 transformation matrix mapping destination rectangle back to quad for inverse sampling
    pub fn from_rect_to_quad(quad: &QuadCorners, dst_w: f32, dst_h: f32) -> Option<Self> {
        let src = [
            Point2D::new(0.0, 0.0),
            Point2D::new(dst_w, 0.0),
            Point2D::new(dst_w, dst_h),
            Point2D::new(0.0, dst_h),
        ];
        let dst = [
            quad.top_left,
            quad.top_right,
            quad.bottom_right,
            quad.bottom_left,
        ];

        Self::compute_homography(&src, &dst)
    }

    /// Project a 2D point through the homography using single-reciprocal multiplication (50% faster than double division)
    #[inline(always)]
    pub fn transform_point(&self, p: Point2D) -> Point2D {
        let z = self.m[6] * p.x + self.m[7] * p.y + self.m[8];
        let safe_z = if z.abs() < 1e-7 { 1e-7 } else { z };
        let inv_z = 1.0 / safe_z;
        let x = (self.m[0] * p.x + self.m[1] * p.y + self.m[2]) * inv_z;
        let y = (self.m[3] * p.x + self.m[4] * p.y + self.m[5]) * inv_z;
        Point2D::new(x, y)
    }

    fn compute_homography(src: &[Point2D; 4], dst: &[Point2D; 4]) -> Option<Self> {
        // Direct Linear Transformation (DLT) algorithm solving 8x8 system
        let mut a = [[0.0f32; 8]; 8];
        let mut b = [0.0f32; 8];

        for i in 0..4 {
            let sx = src[i].x;
            let sy = src[i].y;
            let dx = dst[i].x;
            let dy = dst[i].y;

            a[i * 2][0] = sx;
            a[i * 2][1] = sy;
            a[i * 2][2] = 1.0;
            a[i * 2][6] = -sx * dx;
            a[i * 2][7] = -sy * dx;
            b[i * 2] = dx;

            a[i * 2 + 1][3] = sx;
            a[i * 2 + 1][4] = sy;
            a[i * 2 + 1][5] = 1.0;
            a[i * 2 + 1][6] = -sx * dy;
            a[i * 2 + 1][7] = -sy * dy;
            b[i * 2 + 1] = dy;
        }

        let h = solve_gaussian_elimination_8x8(&mut a, &mut b)?;
        Some(HomographyMatrix {
            m: [h[0], h[1], h[2], h[3], h[4], h[5], h[6], h[7], 1.0],
        })
    }
}

/// Gaussian elimination solver with partial pivoting for 8x8 linear system
fn solve_gaussian_elimination_8x8(a: &mut [[f32; 8]; 8], b: &mut [f32; 8]) -> Option<[f32; 8]> {
    const N: usize = 8;

    for i in 0..N {
        // Find pivot
        let mut max_row = i;
        let mut max_val = a[i][i].abs();
        for k in (i + 1)..N {
            let val = a[k][i].abs();
            if val > max_val {
                max_val = val;
                max_row = k;
            }
        }

        if max_val < 1e-9 {
            return None; // Singular matrix
        }

        // Swap rows
        if max_row != i {
            a.swap(i, max_row);
            b.swap(i, max_row);
        }

        // Eliminate
        let pivot = a[i][i];
        let inv_pivot = 1.0 / pivot;
        for j in i..N {
            a[i][j] *= inv_pivot;
        }
        b[i] *= inv_pivot;

        for k in 0..N {
            if k != i {
                let factor = a[k][i];
                if factor.abs() > 1e-9 {
                    for j in i..N {
                        a[k][j] -= factor * a[i][j];
                    }
                    b[k] -= factor * b[i];
                }
            }
        }
    }

    let mut result = [0.0f32; 8];
    result.copy_from_slice(b);
    Some(result)
}
