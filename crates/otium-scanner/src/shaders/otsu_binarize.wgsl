// ==============================================================================
// Otium Sovereign Studio - High-Performance GPU Compute Shader
// Adaptive Otsu Document Thresholding & High-Contrast Shadow Removal
// ==============================================================================

struct FilterUniforms {
    width: u32,
    height: u32,
    threshold: f32, // Computed Otsu threshold (0.0 to 1.0)
    contrast_boost: f32,
};

@group(0) @binding(0) var input_texture: texture_2d<f32>;
@group(0) @binding(1) var output_texture: texture_storage_2d<r8unorm, write>;
@group(0) @binding(2) var<uniform> config: FilterUniforms;

@compute @workgroup_size(16, 16, 1)
fn main(@builtin(global_invocation_id) global_id: vec3<u32>) {
    let x = global_id.x;
    let y = global_id.y;

    if (x >= config.width || y >= config.height) {
        return;
    }

    let coord = vec2<i32>(i32(x), i32(y));
    let pixel = textureLoad(input_texture, coord, 0);

    // ITU-R BT.601 perceptual luminance weights
    let luma = 0.299 * pixel.r + 0.587 * pixel.g + 0.114 * pixel.b;

    var out_val: f32 = 1.0;
    if (luma < config.threshold) {
        // Deepen text ink and eliminate background bleed-through
        let ratio = luma / config.threshold;
        out_val = clamp(pow(ratio, config.contrast_boost) * 0.45, 0.0, 1.0);
    } else {
        // Flatten paper grain and ambient lighting shadows to pure paper white
        out_val = 1.0;
    }

    textureStore(output_texture, coord, vec4<f32>(out_val, out_val, out_val, 1.0));
}
