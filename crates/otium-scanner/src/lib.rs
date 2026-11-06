pub mod geometry;
pub mod processor;

pub use geometry::*;
pub use processor::*;

#[cfg(test)]
mod tests {
    use super::*;
    use image::{ImageBuffer, Rgba};

    #[test]
    fn test_quad_dimensions_estimation() {
        let quad = QuadCorners::new(
            Point2D::new(0.0, 0.0),
            Point2D::new(800.0, 0.0),
            Point2D::new(800.0, 600.0),
            Point2D::new(0.0, 600.0),
        );
        let (w, h) = quad.estimate_target_dimensions();
        assert_eq!(w, 800);
        assert_eq!(h, 600);
    }

    #[test]
    fn test_homography_identity() {
        let quad = QuadCorners::new(
            Point2D::new(0.0, 0.0),
            Point2D::new(100.0, 0.0),
            Point2D::new(100.0, 100.0),
            Point2D::new(0.0, 100.0),
        );
        let homography = HomographyMatrix::from_quad_to_rect(&quad, 100.0, 100.0).unwrap();
        let pt = homography.transform_point(Point2D::new(50.0, 50.0));
        assert!((pt.x - 50.0).abs() < 1e-3);
        assert!((pt.y - 50.0).abs() < 1e-3);
    }

    #[test]
    fn test_id_card_stitching_canvas_size() {
        let front = ImageBuffer::from_pixel(100, 60, Rgba([200, 0, 0, 255]));
        let back = ImageBuffer::from_pixel(100, 60, Rgba([0, 0, 200, 255]));
        let a4 = DocumentScanner::stitch_id_card_a4(&front, &back);
        assert_eq!(a4.width(), 2480);
        assert_eq!(a4.height(), 3508);
    }
}
