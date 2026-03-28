use anyhow::Result;
use chrono::{DateTime, NaiveDateTime, Utc};
use std::io::Cursor;

pub struct ImageMeta {
    pub width: u32,
    pub height: u32,
    pub taken_at: Option<DateTime<Utc>>,
    pub camera_make: Option<String>,
    pub camera_model: Option<String>,
    pub orientation: Option<i32>,
    pub location: Option<GeoLocation>,
    pub exif: Option<serde_json::Value>,
}

pub struct GeoLocation {
    pub lat: f64,
    pub lng: f64,
}

/// Extract EXIF metadata from image bytes.
pub fn extract_metadata(data: &[u8]) -> Result<ImageMeta> {
    // Get dimensions without decoding the whole image
    let reader = image::ImageReader::new(std::io::Cursor::new(data))
        .with_guessed_format()?;
    let (width, height) = reader.into_dimensions()?;

    let mut meta = ImageMeta {
        width,
        height,
        taken_at: None,
        camera_make: None,
        camera_model: None,
        orientation: None,
        location: None,
        exif: None,
    };

    // Try to read EXIF data
    let mut cursor = Cursor::new(data);
    if let Ok(exif_reader) = exif::Reader::new().read_from_container(&mut cursor) {
        let mut exif_map = serde_json::Map::new();

        for field in exif_reader.fields() {
            let tag_name = format!("{}", field.tag);
            let value = field.display_value().with_unit(&exif_reader).to_string();
            exif_map.insert(tag_name.clone(), serde_json::Value::String(value.clone()));

            match field.tag {
                exif::Tag::DateTimeOriginal | exif::Tag::DateTime => {
                    if meta.taken_at.is_none() {
                        meta.taken_at = parse_exif_date(&value);
                    }
                }
                exif::Tag::Make => {
                    meta.camera_make = Some(value);
                }
                exif::Tag::Model => {
                    meta.camera_model = Some(value);
                }
                exif::Tag::Orientation => {
                    if let exif::Value::Short(ref v) = field.value {
                        meta.orientation = v.first().map(|&o| o as i32);
                    }
                }
                exif::Tag::GPSLatitude => {
                    if let Some(lat) = parse_gps_coord(field, &exif_reader, exif::Tag::GPSLatitudeRef) {
                        if let Some(ref mut loc) = meta.location {
                            loc.lat = lat;
                        } else {
                            meta.location = Some(GeoLocation { lat, lng: 0.0 });
                        }
                    }
                }
                exif::Tag::GPSLongitude => {
                    if let Some(lng) = parse_gps_coord(field, &exif_reader, exif::Tag::GPSLongitudeRef) {
                        if let Some(ref mut loc) = meta.location {
                            loc.lng = lng;
                        } else {
                            meta.location = Some(GeoLocation { lat: 0.0, lng });
                        }
                    }
                }
                _ => {}
            }
        }

        if !exif_map.is_empty() {
            meta.exif = Some(serde_json::Value::Object(exif_map));
        }
    }

    Ok(meta)
}

fn parse_exif_date(date_str: &str) -> Option<DateTime<Utc>> {
    // EXIF format: "YYYY:MM:DD HH:MM:SS" or "YYYY-MM-DD HH:MM:SS"
    let _normalized = date_str
        .replace(|c: char| c == ':', "-")
        .replacen("-", ":", 0);

    // Try common EXIF date format
    let trimmed = date_str.trim();
    if let Ok(ndt) = NaiveDateTime::parse_from_str(trimmed, "%Y-%m-%d %H:%M:%S") {
        return Some(ndt.and_utc());
    }

    // Try EXIF original format: "2026:03:15 14:30:00"
    let fixed = trimmed.replacen(':', "-", 2);
    if let Ok(ndt) = NaiveDateTime::parse_from_str(&fixed, "%Y-%m-%d %H:%M:%S") {
        return Some(ndt.and_utc());
    }

    None
}

fn parse_gps_coord(
    field: &exif::Field,
    reader: &exif::Exif,
    ref_tag: exif::Tag,
) -> Option<f64> {
    if let exif::Value::Rational(ref rationals) = field.value {
        if rationals.len() >= 3 {
            let degrees = rationals[0].to_f64();
            let minutes = rationals[1].to_f64();
            let seconds = rationals[2].to_f64();
            let mut coord = degrees + minutes / 60.0 + seconds / 3600.0;

            // Check reference (N/S or E/W)
            if let Some(ref_field) = reader.get_field(ref_tag, exif::In::PRIMARY) {
                let ref_val = ref_field.display_value().to_string();
                if ref_val == "S" || ref_val == "W" {
                    coord = -coord;
                }
            }

            return Some(coord);
        }
    }
    None
}
