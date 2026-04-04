use anyhow::{anyhow, Result};
use image::GenericImageView;
use std::num::NonZeroU32;
use std::sync::Arc;

use crate::storage::{StorageProvider, ThumbnailSize};

pub struct ThumbnailResult {
    pub micro: String,
    pub small: String,
    pub medium: String,
    pub large: String,
    pub web: String,
    pub blur_hash: String,
    pub width: u32,
    pub height: u32,
    pub aspect_ratio: f64,
}

const SIZES: [(ThumbnailSize, u32); 5] = [
    (ThumbnailSize::Web, 1920),
    (ThumbnailSize::Large, 800),
    (ThumbnailSize::Medium, 400),
    (ThumbnailSize::Small, 150),
    (ThumbnailSize::Micro, 50),
];

/// Generate 5-tier WebP thumbnails and a BlurHash for an image buffer.
///
/// Performance stack:
/// - Decode:  zune-jpeg (SIMD, pure Rust, ~3-4x faster than image crate)
/// - Resize:  fast_image_resize (SIMD Bilinear)
/// - Encode:  webp encoder (efficient WebP compression)
/// - Upload:  parallel via tokio::try_join!
pub async fn generate_thumbnails(
    data: bytes::Bytes,
    storage_path: String,
    storage: Arc<dyn StorageProvider>,
    orientation: Option<i32>,
    encryption_key: Option<String>,
) -> Result<ThumbnailResult> {
    let t_start = std::time::Instant::now();
    let (tx, mut rx) = tokio::sync::mpsc::unbounded_channel::<(ThumbnailSize, Vec<u8>)>();

    // CPU-bound work in spawn_blocking: decode → resize 4 sizes → encode → blurhash
    let blocking_handle = tokio::task::spawn_blocking(move || -> Result<_> {
        let t_cpu = std::time::Instant::now();
        // ── DECODE ────────────────────────────────────────────────────────
        // Try zune-jpeg (fast SIMD) first; fall back to `image` for non-JPEG
        let (mut rgba_pixels, mut orig_width, mut orig_height): (Vec<u8>, u32, u32) =
            if is_jpeg(data.as_ref()) {
                let mut decoder = zune_jpeg::JpegDecoder::new(data.as_ref());
                // Force RGBA output so fast_image_resize can use U8x4 directly
                decoder.set_options(
                    zune_jpeg::zune_core::options::DecoderOptions::default()
                        .jpeg_set_out_colorspace(zune_jpeg::zune_core::colorspace::ColorSpace::RGBA),
                );
                let pixels = decoder.decode()?;
                let info = decoder.info().ok_or_else(|| anyhow!("No JPEG info"))?;
                (pixels, info.width as u32, info.height as u32)
            } else {
                // PNG, HEIC, WebP, etc. — fallback to `image` crate
                let img = image::load_from_memory(&data)?;
                let (w, h) = img.dimensions();
                let rgba = img.into_rgba8();
                (rgba.into_raw(), w, h)
            };

        // ── APPLY ORIENTATION ─────────────────────────────────────────────
        if let Some(ori) = orientation {
            if ori > 1 && ori <= 8 {
                if let Some(img) = image::RgbaImage::from_vec(orig_width, orig_height, rgba_pixels) {
                    let rotated = match ori {
                        2 => image::imageops::flip_horizontal(&img),
                        3 => image::imageops::rotate180(&img),
                        4 => image::imageops::flip_vertical(&img),
                        5 => {
                            let flipped = image::imageops::flip_horizontal(&img);
                            image::imageops::rotate270(&flipped)
                        }
                        6 => image::imageops::rotate90(&img),
                        7 => {
                            let flipped = image::imageops::flip_horizontal(&img);
                            image::imageops::rotate90(&flipped)
                        }
                        8 => image::imageops::rotate270(&img),
                        _ => img,
                    };
                    orig_width = rotated.width();
                    orig_height = rotated.height();
                    rgba_pixels = rotated.into_raw();
                } else {
                    return Err(anyhow::anyhow!("Failed to convert pixel buffer for orientation rotation"));
                }
            }
        }

        let aspect_ratio = orig_width as f64 / orig_height.max(1) as f64;

        // ── RESIZE + ENCODE ───────────────────────────────────────────────
        let mut current_pixels = rgba_pixels;
        let mut current_w = orig_width;
        let mut current_h = orig_height;
        
        let mut resizer = fast_image_resize::Resizer::new(fast_image_resize::ResizeAlg::Convolution(fast_image_resize::FilterType::Bilinear));

        for (size, target_px) in &SIZES {
            let (new_w, new_h) = fit_dimensions(current_w, current_h, *target_px);

            let resized = if current_w == new_w && current_h == new_h {
                // Already the right size — skip resize
                current_pixels.clone()
            } else {
                resize_rgba(&mut resizer, &mut current_pixels, current_w, current_h, new_w, new_h)?
            };

            let web_p = encode_webp(&resized, new_w, new_h, *size)?;
            // Send to async upload task immediately
            let _ = tx.send((*size, web_p));

            current_pixels = resized;
            current_w = new_w;
            current_h = new_h;
        }

        // ── BLURHASH ──────────────────────────────────────────────────────
        // Use the Micro image (already 50px) — no extra resize
        let blur_hash = generate_blurhash(&current_pixels, current_w, current_h);

        tracing::info!("CPU thumbnail work finished in {:?}", t_cpu.elapsed());
        Ok((blur_hash, orig_width, orig_height, aspect_ratio))
    });

    // ── UPLOAD (pipelined) ───────────────────────────────────────────────────
    let mut join_set = tokio::task::JoinSet::new();

    // Receive thumbnails as they are generated and spawn upload tasks
    while let Some((size, webp_data)) = rx.recv().await {
        let st = storage.clone();
        let path = storage_path.clone();
        let enc_key = encryption_key.clone();
        join_set.spawn(async move {
            let res_path = st.upload_thumbnail_encrypted(&webp_data, &path, size, enc_key.as_deref()).await?;
            Ok::<_, anyhow::Error>((size, res_path))
        });
    }

    // Ensure the blocking task didn't error
    let (blur_hash, width, height, aspect_ratio) = blocking_handle.await??;

    let mut web_res = String::new();
    let mut large_res = String::new();
    let mut medium_res = String::new();
    let mut small_res = String::new();
    let mut micro_res = String::new();

    // Await all uploads
    let t_uploads = std::time::Instant::now();
    while let Some(res) = join_set.join_next().await {
        let (size, path) = res??;
        match size {
            ThumbnailSize::Web => web_res = path,
            ThumbnailSize::Large => large_res = path,
            ThumbnailSize::Medium => medium_res = path,
            ThumbnailSize::Small => small_res = path,
            ThumbnailSize::Micro => micro_res = path,
        }
    }
    tracing::info!("All async pipelined uploads finished in {:?} (from start: {:?})", t_uploads.elapsed(), t_start.elapsed());

    Ok(ThumbnailResult {
        web: web_res,
        large: large_res,
        medium: medium_res,
        small: small_res,
        micro: micro_res,
        blur_hash,
        width,
        height,
        aspect_ratio,
    })
}

// ── Helpers ───────────────────────────────────────────────────────────────────

/// Detect JPEG by magic bytes (faster than file extension).
#[inline]
fn is_jpeg(data: &[u8]) -> bool {
    data.len() >= 3 && data[0] == 0xFF && data[1] == 0xD8 && data[2] == 0xFF
}

/// Compute (new_width, new_height) that fits within max_px while preserving AR.
fn fit_dimensions(w: u32, h: u32, max_px: u32) -> (u32, u32) {
    if w <= max_px && h <= max_px {
        return (w, h);
    }
    let aspect = w as f64 / h as f64;
    let (nw, nh) = if w > h {
        (max_px, (max_px as f64 / aspect).round() as u32)
    } else {
        ((max_px as f64 * aspect).round() as u32, max_px)
    };
    (nw.max(1), nh.max(1))
}

/// Resize RGBA8 pixels using fast_image_resize (SIMD Bilinear).
fn resize_rgba(
    resizer: &mut fast_image_resize::Resizer,
    pixels: &mut [u8],
    src_w: u32,
    src_h: u32,
    dst_w: u32,
    dst_h: u32,
) -> Result<Vec<u8>> {
    use fast_image_resize as fr;

    let src = fr::Image::from_slice_u8(
        NonZeroU32::new(src_w).unwrap(),
        NonZeroU32::new(src_h).unwrap(),
        pixels,
        fr::PixelType::U8x4,
    )?;

    let mut dst = fr::Image::new(
        NonZeroU32::new(dst_w).unwrap(),
        NonZeroU32::new(dst_h).unwrap(),
        fr::PixelType::U8x4,
    );

    resizer.resize(&src.view(), &mut dst.view_mut())?;

    Ok(dst.into_vec())
}

/// Encode RGBA8 pixels to WebP.
fn encode_webp(pixels: &[u8], w: u32, h: u32, size: ThumbnailSize) -> Result<Vec<u8>> {
    let quality = match size {
        ThumbnailSize::Micro => 60.0,
        ThumbnailSize::Small => 72.0,
        _ => 82.0, // Used for Medium, Large, Web
    };

    let encoder = webp::Encoder::from_rgba(pixels, w, h);
    let webp_memory = encoder.encode(quality);

    Ok(webp_memory.to_vec())
}

/// Generate BlurHash from tiny RGBA pixels.
fn generate_blurhash(pixels: &[u8], w: u32, h: u32) -> String {
    match blurhash::encode(4, 3, w, h, pixels) {
        Ok(hash) => hash,
        Err(_) => String::new(),
    }
}
