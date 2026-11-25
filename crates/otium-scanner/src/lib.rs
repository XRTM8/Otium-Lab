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
    fn test_clean_document_filter() {
        let mut img = ImageBuffer::new(100, 100);
        for pixel in img.pixels_mut() {
            *pixel = Rgba([200, 200, 200, 255]); // Light gray
        }
        let clean = DocumentScanner::clean_document_filter(&img, 1.2);
        assert_eq!(clean.dimensions(), (100, 100));
    }
}
