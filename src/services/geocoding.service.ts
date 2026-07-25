import { Injectable, Logger } from '@nestjs/common';
import * as https from 'https';

export interface GeoLocation {
  city: string;
  lat: number | null;
  lon: number | null;
}

const KNOWN_CITIES: Record<string, { lat: number; lon: number }> = {
  'київ': { lat: 50.4501, lon: 30.5234 },
  'kyiv': { lat: 50.4501, lon: 30.5234 },
  'kiev': { lat: 50.4501, lon: 30.5234 },
  'львів': { lat: 49.8397, lon: 24.0297 },
  'lviv': { lat: 49.8397, lon: 24.0297 },
  'сокільники': { lat: 49.7825, lon: 23.9719 },
  'одеса': { lat: 46.4825, lon: 30.7233 },
  'odessa': { lat: 46.4825, lon: 30.7233 },
  'харків': { lat: 49.9935, lon: 36.2304 },
  'kharkiv': { lat: 49.9935, lon: 36.2304 },
  'дніпро': { lat: 48.4647, lon: 35.0462 },
  'dnipro': { lat: 48.4647, lon: 35.0462 },
  'запоріжжя': { lat: 47.8388, lon: 35.1396 },
  'вінниця': { lat: 49.2331, lon: 28.4682 },
  'тернопіль': { lat: 49.5535, lon: 25.5948 },
  'івано-франківськ': { lat: 48.9226, lon: 24.7111 },
  'чернівці': { lat: 48.2921, lon: 25.9358 },
  'хмельницький': { lat: 49.423, lon: 26.9871 },
  'рівне': { lat: 50.6199, lon: 26.2516 },
  'луцьк': { lat: 50.7472, lon: 25.3254 },
  'ужгород': { lat: 48.6208, lon: 22.2879 },
  'черкаси': { lat: 49.4444, lon: 32.0598 },
  'полтава': { lat: 49.5883, lon: 34.5514 },
  'суми': { lat: 50.9077, lon: 34.7981 },
  'чернігів': { lat: 51.4982, lon: 31.2893 },
  'житомир': { lat: 50.2547, lon: 28.6587 },
  'миколаїв': { lat: 46.975, lon: 31.9946 },
  'херсон': { lat: 46.6354, lon: 32.6169 },
  'кривий ріг': { lat: 47.91, lon: 33.39 },
  'бровари': { lat: 50.5113, lon: 30.7903 },
  'бориспіль': { lat: 50.3541, lon: 30.9575 },
  'ірпінь': { lat: 50.5192, lon: 30.2458 },
  'буча': { lat: 50.5487, lon: 30.2215 },
  'варшава': { lat: 52.2297, lon: 21.0122 },
  'warsaw': { lat: 52.2297, lon: 21.0122 },
  'краків': { lat: 50.0647, lon: 19.945 },
  'krakow': { lat: 50.0647, lon: 19.945 },
  'вроцлав': { lat: 51.1079, lon: 17.0385 },
  'прага': { lat: 50.0755, lon: 14.4378 },
  'берлін': { lat: 52.52, lon: 13.405 },
};

@Injectable()
export class GeocodingService {
  private readonly logger = new Logger(GeocodingService.name);

  async geocodeCity(cityName: string): Promise<GeoLocation> {
    if (!cityName) {
      return { city: cityName, lat: null, lon: null };
    }

    const trimmed = cityName.trim();
    const normalized = trimmed.toLowerCase();

    // 1. Check known cities dictionary for fast offline response
    if (KNOWN_CITIES[normalized]) {
      const coords = KNOWN_CITIES[normalized];
      return { city: trimmed, lat: coords.lat, lon: coords.lon };
    }

    // 2. Query OpenStreetMap Nominatim API via native Node https
    try {
      const coords = await this.queryNominatim(trimmed);
      if (coords) {
        this.logger.log(`Geocoded text location "${trimmed}" -> lat: ${coords.lat}, lon: ${coords.lon}`);
        return { city: trimmed, lat: coords.lat, lon: coords.lon };
      }
    } catch (err) {
      this.logger.warn(`OpenStreetMap geocoding request failed for "${trimmed}": ${err.message}`);
    }

    return { city: cityName, lat: null, lon: null };
  }

  async searchCities(cityName: string): Promise<Array<{ city: string; display: string; lat: number; lon: number }>> {
    if (!cityName) return [];
    
    return new Promise((resolve) => {
      const url = `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(cityName)}&format=json&limit=15&addressdetails=1&accept-language=uk`;
      const options: https.RequestOptions = {
        headers: {
          'User-Agent': 'TelegramDatingBot/1.0',
        },
        timeout: 3000,
      };

      const req = https.get(url, options, (res) => {
        let data = '';
        res.on('data', (chunk) => (data += chunk));
        res.on('end', () => {
          try {
            const parsed = JSON.parse(data);
            if (Array.isArray(parsed)) {
              const results = parsed.map((item: any) => {
                const addr = item.address || {};
                const name = addr.city || addr.town || addr.village || addr.hamlet || addr.suburb || addr.municipality || cityName;
                const county = addr.county || addr.district || '';
                const state = addr.state || '';
                const country = addr.country || '';

                // Build a nice shortened display name
                const displayParts = [name];
                if (county) displayParts.push(county);
                if (state && state !== county) displayParts.push(state);
                if (country && country !== 'Україна') displayParts.push(country);

                const display = displayParts.join(', ');
                const lat = parseFloat(item.lat);
                const lon = parseFloat(item.lon);

                return {
                  city: name,
                  display: display.length > 50 ? display.slice(0, 47) + '...' : display,
                  lat,
                  lon
                };
              });
              resolve(results);
            } else {
              resolve([]);
            }
          } catch {
            resolve([]);
          }
        });
      });

      req.on('error', () => resolve([]));
      req.on('timeout', () => {
        req.destroy();
        resolve([]);
      });
    });
  }

  async reverseGeocode(lat: number, lon: number): Promise<string> {
    // 1. Query Nominatim reverse API for exact village/city/town name
    try {
      const resolvedName = await this.queryNominatimReverse(lat, lon);
      if (resolvedName) {
        this.logger.log(`Reverse geocoded (${lat}, ${lon}) -> "${resolvedName}"`);
        return resolvedName;
      }
    } catch (err) {
      this.logger.warn(`Reverse geocoding request failed: ${err.message}`);
    }

    // 2. Fallback to closest known city using Haversine distance
    let closestCity = '';
    let minDistance = Infinity;

    for (const [cityName, coords] of Object.entries(KNOWN_CITIES)) {
      const dist = this.haversineDistance(lat, lon, coords.lat, coords.lon);
      if (dist < minDistance) {
        minDistance = dist;
        closestCity = cityName.charAt(0).toUpperCase() + cityName.slice(1);
      }
    }

    return closestCity || 'Україна';
  }

  private queryNominatim(cityName: string): Promise<{ lat: number; lon: number } | null> {
    return new Promise((resolve) => {
      const url = `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(cityName)}&format=json&limit=1`;
      const options: https.RequestOptions = {
        headers: {
          'User-Agent': 'TelegramDatingBot/1.0',
        },
        timeout: 3000,
      };

      const req = https.get(url, options, (res) => {
        let data = '';
        res.on('data', (chunk) => (data += chunk));
        res.on('end', () => {
          try {
            const parsed = JSON.parse(data);
            if (Array.isArray(parsed) && parsed.length > 0) {
              const lat = parseFloat(parsed[0].lat);
              const lon = parseFloat(parsed[0].lon);
              resolve({ lat, lon });
            } else {
              resolve(null);
            }
          } catch {
            resolve(null);
          }
        });
      });

      req.on('error', () => resolve(null));
      req.on('timeout', () => {
        req.destroy();
        resolve(null);
      });
    });
  }

  private queryNominatimReverse(lat: number, lon: number): Promise<string | null> {
    return new Promise((resolve) => {
      const url = `https://nominatim.openstreetmap.org/reverse?lat=${lat}&lon=${lon}&format=json&accept-language=uk`;
      const options: https.RequestOptions = {
        headers: {
          'User-Agent': 'TelegramDatingBot/1.0',
        },
        timeout: 3000,
      };

      const req = https.get(url, options, (res) => {
        let data = '';
        res.on('data', (chunk) => (data += chunk));
        res.on('end', () => {
          try {
            const parsed = JSON.parse(data);
            const address = parsed.address;
            if (address) {
              const cityName = address.city || address.town || address.village || address.suburb || address.municipality || address.county;
              if (cityName) {
                resolve(cityName);
                return;
              }
            }
            resolve(null);
          } catch {
            resolve(null);
          }
        });
      });

      req.on('error', () => resolve(null));
      req.on('timeout', () => {
        req.destroy();
        resolve(null);
      });
    });
  }

  private haversineDistance(lat1: number, lon1: number, lat2: number, lon2: number): number {
    const R = 6371;
    const dLat = this.deg2rad(lat2 - lat1);
    const dLon = this.deg2rad(lon2 - lon1);
    const a =
      Math.sin(dLat / 2) * Math.sin(dLat / 2) +
      Math.cos(this.deg2rad(lat1)) * Math.cos(this.deg2rad(lat2)) *
      Math.sin(dLon / 2) * Math.sin(dLon / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return R * c;
  }

  private deg2rad(deg: number): number {
    return deg * (Math.PI / 180);
  }
}
