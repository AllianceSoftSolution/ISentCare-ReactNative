import * as Location from 'expo-location';
import { Platform } from 'react-native';

/** Match the server geofence radius; reject only clearly unusable readings. */
const MAX_ACCURACY_METERS = Platform.OS === 'web' ? 250 : 100;
const MAX_LOCATION_AGE_MS = 45_000;
const LOCATION_TIMEOUT_MS = 25_000;

export class ShiftLocationError extends Error {
  constructor(
    message: string,
    readonly canOpenSettings = false,
  ) {
    super(message);
    this.name = 'ShiftLocationError';
  }
}

function isUsableReading(location: Location.LocationObject) {
  const { latitude, longitude, accuracy } = location.coords;
  if (
    !Number.isFinite(latitude)
    || !Number.isFinite(longitude)
    || latitude < -90
    || latitude > 90
    || longitude < -180
    || longitude > 180
  ) {
    return false;
  }

  const age = Date.now() - location.timestamp;
  // Clock skew can produce a tiny negative age; treat that as fresh.
  if (age > MAX_LOCATION_AGE_MS) return false;

  // Missing accuracy is common on web / some devices — let the backend geofence decide.
  if (accuracy == null || !Number.isFinite(accuracy)) return true;
  return accuracy <= MAX_ACCURACY_METERS;
}

async function readCurrentPosition(): Promise<Location.LocationObject> {
  let timeout: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      Location.getCurrentPositionAsync({
        accuracy: Platform.OS === 'web' ? Location.Accuracy.High : Location.Accuracy.Highest,
        mayShowUserSettingsDialog: true,
      }),
      new Promise<never>((_, reject) => {
        timeout = setTimeout(
          () => reject(new ShiftLocationError('Could not get a GPS reading in time. Move to an open area and try again.')),
          LOCATION_TIMEOUT_MS,
        );
      }),
    ]);
  } finally {
    if (timeout) clearTimeout(timeout);
  }
}

export async function getFreshShiftLocation(): Promise<Location.LocationObjectCoords> {
  if (!(await Location.hasServicesEnabledAsync())) {
    throw new ShiftLocationError('Turn on location services in your device settings, then try again.');
  }

  const permission = await Location.requestForegroundPermissionsAsync();
  if (permission.status !== 'granted') {
    throw new ShiftLocationError(
      permission.canAskAgain
        ? 'Location permission is needed to start this shift. Allow access and try again.'
        : Platform.OS === 'web'
          ? 'Location permission is blocked. Enable location access for this site in your browser settings, then try again.'
          : 'Location permission is blocked. Enable location access for IsentCare in your device settings.',
      !permission.canAskAgain && Platform.OS !== 'web',
    );
  }

  let lastError: Error | null = null;
  for (let attempt = 0; attempt < 2; attempt += 1) {
    try {
      const location = await readCurrentPosition();
      if (isUsableReading(location)) {
        return location.coords;
      }
      lastError = new ShiftLocationError(
        'Your GPS reading is too old or inaccurate to verify this shift. Move to an open area and try again.',
      );
    } catch (locationError) {
      if (locationError instanceof ShiftLocationError) {
        lastError = locationError;
      } else {
        lastError = new ShiftLocationError(
          'Unable to get your current location. Check location services and try again.',
        );
      }
    }
  }

  throw lastError ?? new ShiftLocationError(
    'Unable to get your current location. Check location services and try again.',
  );
}
