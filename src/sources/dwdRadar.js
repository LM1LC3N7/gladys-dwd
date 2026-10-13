// -----------------------------------------------------------------------------
// Precipitation radar image: the DWD WMS composite ("Niederschlagsradar",
// the RV product, 1 km, every 5 minutes) over the country borders of the
// same server, in one request, then a marker on the house.
//
// Licence: DWD open data (GeoBasis-DE / BKG for the borders), attribution
// required, see NOTICE.
// -----------------------------------------------------------------------------

import { PNG } from 'pngjs';
import { DWD_GEOSERVER_URL } from '../constants.js';
import { fetchImage } from '../http.js';
import { mercatorBbox } from '../geo.js';

export const RADAR_WIDTH = 600;
export const RADAR_HEIGHT = 400;
// 300 km × 200 km around the house: a few hours of incoming precipitation.
const HALF_WIDTH_KM = 150;
const HALF_HEIGHT_KM = 100;
// The radar first, the borders drawn over it so they stay readable.
const LAYERS = ['dwd:Niederschlagsradar', 'dwd:Laender'];
const STYLES = ['', 'Laender_schwarz'];
const MARKER = [220, 38, 38];
// Gladys refuses an image over 500 KB.
export const MAX_IMAGE_BYTES = 500 * 1024;

export function radarUrl(latitude, longitude) {
  const bbox = mercatorBbox(latitude, longitude, HALF_WIDTH_KM, HALF_HEIGHT_KM);
  const params = new URLSearchParams({
    service: 'WMS',
    version: '1.3.0',
    request: 'GetMap',
    layers: LAYERS.join(','),
    styles: STYLES.join(','),
    crs: 'EPSG:3857',
    bbox: bbox.join(','),
    width: String(RADAR_WIDTH),
    height: String(RADAR_HEIGHT),
    format: 'image/png',
  });
  return `${DWD_GEOSERVER_URL}/wms?${params}`;
}

/** A ring on the house, in the middle of the image. */
export function drawMarker(image) {
  const cx = Math.floor(image.width / 2);
  const cy = Math.floor(image.height / 2);
  for (let y = cy - 8; y <= cy + 8; y += 1) {
    for (let x = cx - 8; x <= cx + 8; x += 1) {
      const d = Math.hypot(x - cx, y - cy);
      const color = d <= 3 ? MARKER : d >= 5.5 && d <= 7.5 ? [255, 255, 255] : undefined;
      if (color && x >= 0 && y >= 0 && x < image.width && y < image.height) {
        image.data.set([...color, 255], (y * image.width + x) * 4);
      }
    }
  }
}

/**
 * The radar image of a location.
 * @returns {Promise<string>} raw base64 of a PNG (no data URI prefix)
 */
export async function buildRadarImage(latitude, longitude, { timeout } = {}) {
  const buffer = await fetchImage(radarUrl(latitude, longitude), { timeout });
  const image = PNG.sync.read(buffer);
  drawMarker(image);
  const png = PNG.sync.write(image, { colorType: 2 });
  if (png.length > MAX_IMAGE_BYTES) {
    throw new Error(`Radar image too large (${png.length} bytes)`);
  }
  return png.toString('base64');
}
