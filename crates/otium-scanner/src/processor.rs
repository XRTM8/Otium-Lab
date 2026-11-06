use image::{DynamicImage, GrayImage, ImageBuffer, Luma, Rgba, RgbaImage};

use crate::geometry::{HomographyMatrix, Point2D, QuadCorners};
use otium_core::{OtiumError, Result};

pub struct DocumentScanner;

impl DocumentScanner {
    /// Warp a quadrilateral document region into a rectified rectangular image using bilinear interpolation.
    pub fn warp_perspective(
        image: &DynamicImage,
        corners: &QuadCorners,
        target_dimensions: Option<(u32, u32)>,
    ) -> Result<RgbaImage> {
        let (dst_w, dst_h) = target_dimensions
            .unwrap_or_else(|| corners.estimate_target_dimensions());

        let homography = HomographyMatrix::from_rect_to_quad(corners, dst_w as f32, dst_h as f32)
            .ok_or_else(|| OtiumError::ImageProcessing("Singular quad corners matrix".into()))?;

        let src_rgba = image.to_rgba8();
        let (src_w, src_h) = src_rgba.dimensions();

        let mut out_img: RgbaImage = ImageBuffer::new(dst_w, dst_h);

        for y in 0..dst_h {
            for x in 0..dst_w {
                let src_pt = homography.transform_point(Point2D::new(x as f32, y as f32));
                let sx = src_pt.x;
                let sy = src_pt.y;

                if sx >= 0.0 && sx < (src_w - 1) as f32 && sy >= 0.0 && sy < (src_h - 1) as f32 {
                    // Bilinear interpolation
                    let x0 = sx.floor() as u32;
                    let y0 = sy.floor() as u32;
                    let x1 = x0 + 1;
                    let y1 = y0 + 1;

                    let fx = sx - x0 as f32;
                    let fy = sy - y0 as f32;

                    let p00 = src_rgba.get_pixel(x0, y0);
                    let p10 = src_rgba.get_pixel(x1, y0);
                    let p01 = src_rgba.get_pixel(x0, y1);
                    let p11 = src_rgba.get_pixel(x1, y1);

                    let mut interpolated = [0u8; 4];
                    for c in 0..4 {
                        let top = (1.0 - fx) * (p00[c] as f32) + fx * (p10[c] as f32);
                        let bottom = (1.0 - fx) * (p01[c] as f32) + fx * (p11[c] as f32);
                        let val = (1.0 - fy) * top + fy * bottom;
                        interpolated[c] = val.round().clamp(0.0, 255.0) as u8;
                    }

                    out_img.put_pixel(x, y, Rgba(interpolated));
                } else {
                    out_img.put_pixel(x, y, Rgba([255, 255, 255, 255]));
                }
            }
        }

        Ok(out_img)
    }

    /// Apply an adaptive high-contrast document clean filter:
    /// Enhances black ink while flattening paper shadows to pure white.
    pub fn clean_document_filter(image: &RgbaImage, contrast_boost: f32) -> GrayImage {
        let (width, height) = image.dimensions();
        let mut gray: GrayImage = ImageBuffer::new(width, height);

        // Compute Otsu threshold or adaptive mean
        let mut sum = 0u64;
        for (_, _, pixel) in image.enumerate_pixels() {
            // Luminance: 0.299 R + 0.587 G + 0.114 B
            let luma = (0.299 * pixel[0] as f32 + 0.587 * pixel[1] as f32 + 0.114 * pixel[2] as f32) as u8;
            sum += luma as u64;
        }

        let mean_luma = (sum / (width as u64 * height as u64).max(1)) as f32;
        let threshold = (mean_luma * 0.85).clamp(80.0, 180.0);

        for (x, y, pixel) in image.enumerate_pixels() {
            let luma = (0.299 * pixel[0] as f32 + 0.587 * pixel[1] as f32 + 0.114 * pixel[2] as f32) as f32;
            let normalized = if luma < threshold {
                ((luma / threshold).powf(contrast_boost) * 120.0).clamp(0.0, 255.0) as u8
            } else {
                255u8
            };
            gray.put_pixel(x, y, Luma([normalized]));
        }

        gray
    }

    /// Combine front and back sides of an ID card onto a clean standard A4 page layout (2480 x 3508 at 300 DPI)
    pub fn stitch_id_card_a4(front: &RgbaImage, back: &RgbaImage) -> RgbaImage {
        const A4_WIDTH: u32 = 2480;
        const A4_HEIGHT: u32 = 3508;

        let mut a4_canvas: RgbaImage = ImageBuffer::from_pixel(A4_WIDTH, A4_HEIGHT, Rgba([255, 255, 255, 255]));

        // Standard ID card size at 300 DPI: ~1010 x 640 px (85.6mm x 53.98mm)
        let target_card_w = 1010;
        let target_card_h = 640;

        let resized_front = image::imageops::resize(
            front,
            target_card_w,
            target_card_h,
            image::imageops::FilterType::Lanczos3,
        );
        let resized_back = image::imageops::resize(
            back,
            target_card_w,
            target_card_h,
            image::imageops::FilterType::Lanczos3,
        );

        // Center front card on upper half of page
        let pos_x = (A4_WIDTH - target_card_w) / 2;
        let pos_front_y = (A4_HEIGHT / 3) - (target_card_h / 2);
        image::imageops::overlay(&mut a4_canvas, &resized_front, pos_x as i64, pos_front_y as i64);

        // Center back card on lower half of page
        let pos_back_y = (2 * A4_HEIGHT / 3) - (target_card_h / 2);
        image::imageops::overlay(&mut a4_canvas, &resized_back, pos_x as i64, pos_back_y as i64);

        a4_canvas
    }
}
