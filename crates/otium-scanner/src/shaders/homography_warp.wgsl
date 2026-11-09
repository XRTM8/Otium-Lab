// ==============================================================================
// Otium Sovereign Studio - High-Performance GPU Compute Shader
// Homography 3x3 Quadrilateral Perspective Warp with Bilinear Filtering
// ==============================================================================

struct WarpUniforms {
    h00: f32, h01: f32, h02: f32, _pad0: f32,
    h10: f32, h11: f32, h12: f32, _pad1: f32,
    h20: f32, h21: f32, h22: f32, _pad2: f32,
    dst_width: u32,
    dst_height: u32,
    src_width: u32,
    src_height: u32,
};

@group(0) @binding(0) var src_texture: texture_2d<f32>;
@group(0) @binding(1) var out_texture: texture_storage_2d<rgba8unorm, write>;
@group(0) @binding(2) var<uniform> params: WarpUniforms;

@compute @workgroup_size(16, 16, 1)
fn main(@builtin(global_invocation_id) global_id: vec3<u32>) {
    let x = global_id.x;
    let y = global_id.y;

    if (x >= params.dst_width || y >= params.dst_height) {
        return;
    }

    let dx = f32(x);
    let dy = f32(y);

    // Apply 3x3 Homography projective transformation
    let z_prime = params.h20 * dx + params.h21 * dy + params.h22;
    if (abs(z_prime) < 0.00001) {
        textureStore(out_texture, vec2<i32>(i32(x), i32(y)), vec4<f32>(1.0, 1.0, 1.0, 1.0));
        return;
    }

    let inv_z = 1.0 / z_prime;
    let sx = (params.h00 * dx + params.h01 * dy + params.h02) * inv_z;
    let sy = (params.h10 * dx + params.h11 * dy + params.h12) * inv_z;

    let max_x = f32(params.src_width - 1u);
    let max_y = f32(params.src_height - 1u);

    if (sx >= 0.0 && sx <= max_x && sy >= 0.0 && sy <= max_y) {
        // Bilinear interpolation on GPU
        let x0 = i32(floor(sx));
        let y0 = i32(floor(sy));
        let x1 = min(x0 + 1, i32(params.src_width - 1u));
        let y1 = min(y0 + 1, i32(params.src_height - 1u));

        let fx = sx - f32(x0);
        let fy = sy - f32(y0);

        let p00 = textureLoad(src_texture, vec2<i32>(x0, y0), 0);
        let p10 = textureLoad(src_texture, vec2<i32>(x1, y0), 0);
        let p01 = textureLoad(src_texture, vec2<i32>(x0, y1), 0);
        let p11 = textureLoad(src_texture, vec2<i32>(x1, y1), 0);

        let top = mix(p00, p10, fx);
        let bottom = mix(p01, p11, fx);
        let interpolated = mix(top, bottom, fy);

        textureStore(out_texture, vec2<i32>(i32(x), i32(y)), interpolated);
    } else {
        // Out-of-bounds rectified margins set to pure paper white
        textureStore(out_texture, vec2<i32>(i32(x), i32(y)), vec4<f32>(1.0, 1.0, 1.0, 1.0));
    }
}
