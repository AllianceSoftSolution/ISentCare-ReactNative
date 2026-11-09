import * as Location from 'expo-location';
import { Platform } from 'react-native';

const MAX_LOCATION_AGE_MS = 30_000;
const MAX_ACCURACY_METERS = 50;
const LOCATION_TIMEOUT_MS = 20_000;

export class ShiftLocationError extends Error {
  constructor(
    message: string,
    readonly canOpenSettings = false,
  ) {
    super(message);
    this.name = 'ShiftLocationError';
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

  let timeout: ReturnType<typeof setTimeout> | undefined;
  let location: Location.LocationObject;
  try {
    location = await Promise.race([
      Location.getCurrentPositionAsync({
        accuracy: Location.Accuracy.Highest,
        mayShowUserSettingsDialog: true,
      }),
      new Promise<never>((_, reject) => {
        timeout = setTimeout(
          () => reject(new ShiftLocationError('Could not get a GPS reading in time. Move to an open area and try again.')),
          LOCATION_TIMEOUT_MS,
        );
      }),
    ]);
  } catch (locationError) {
    if (locationError instanceof ShiftLocationError) throw locationError;
    throw new ShiftLocationError('Unable to get your current location. Check location services and try again.');
  } finally {
    if (timeout) clearTimeout(timeout);
  }

  const { latitude, longitude, accuracy } = location.coords;
  const age = Date.now() - location.timestamp;
  if (
    !Number.isFinite(latitude) ||
    !Number.isFinite(longitude) ||
    latitude < -90 ||
    latitude > 90 ||
    longitude < -180 ||
    longitude > 180 ||
    !Number.isFinite(accuracy) ||
    accuracy === null ||
    accuracy > MAX_ACCURACY_METERS ||
    age < 0 ||
    age > MAX_LOCATION_AGE_MS
  ) {
    throw new ShiftLocationError('Your GPS reading is too old or inaccurate to verify this shift. Move to an open area and try again.');
  }

  return location.coords;
}
