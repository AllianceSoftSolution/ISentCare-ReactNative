import { Platform } from 'react-native';

export type AddressSuggestion = {
  id: string;
  label: string;
};

export type PlaceAddressDetails = {
  address: string;
  city: string;
  zipCode: string;
  stateLong: string;
  stateShort: string;
  latitude?: number | null;
  longitude?: number | null;
};

type GoogleAddressComponent = {
  long_name?: string;
  short_name?: string;
  types?: string[];
};

type GooglePrediction = {
  description?: string;
  place_id?: string;
};

type GoogleMapsPlaces = {
  AutocompleteService: new () => {
    getPlacePredictions: (
      request: {
        input: string;
        types?: string[];
        componentRestrictions?: { country: string | string[] };
      },
      callback: (
        predictions: GooglePrediction[] | null,
        status: string,
      ) => void,
    ) => void;
  };
  PlacesServiceStatus: {
    OK: string;
    ZERO_RESULTS: string;
  };
  PlacesService: new (attributionContainer: HTMLElement) => {
    getDetails: (
      request: { placeId: string; fields: string[] },
      callback: (
        place: {
          formatted_address?: string;
          address_components?: GoogleAddressComponent[];
          geometry?: { location?: { lat: () => number; lng: () => number } };
        } | null,
        status: string,
      ) => void,
    ) => void;
  };
};

declare global {
  var google: { maps?: { places?: GoogleMapsPlaces } } | undefined;
}

let mapsLoader: Promise<GoogleMapsPlaces> | null = null;

function placesApiKey() {
  return process.env.EXPO_PUBLIC_GOOGLE_PLACES_API_KEY?.trim() || '';
}

export function hasPlacesApiKey() {
  return Boolean(placesApiKey());
}

function componentLongName(components: GoogleAddressComponent[], type: string) {
  const match = components.find((component) => component.types?.includes(type));
  return match?.long_name?.trim() || '';
}

function componentShortName(components: GoogleAddressComponent[], type: string) {
  const match = components.find((component) => component.types?.includes(type));
  return match?.short_name?.trim() || '';
}

function detailsFromComponents(
  formattedAddress: string,
  components: GoogleAddressComponent[],
  location?: { lat?: () => number; lng?: () => number } | null,
): PlaceAddressDetails {
  const latitude = typeof location?.lat === 'function' ? location.lat() : null;
  const longitude = typeof location?.lng === 'function' ? location.lng() : null;
  return {
    address: formattedAddress.trim(),
    city:
      componentLongName(components, 'locality')
      || componentLongName(components, 'sublocality')
      || componentLongName(components, 'postal_town'),
    zipCode: componentLongName(components, 'postal_code'),
    stateLong: componentLongName(components, 'administrative_area_level_1'),
    stateShort: componentShortName(components, 'administrative_area_level_1'),
    latitude: Number.isFinite(latitude) ? latitude : null,
    longitude: Number.isFinite(longitude) ? longitude : null,
  };
}

function loadGooglePlaces(): Promise<GoogleMapsPlaces> {
  if (Platform.OS !== 'web') {
    return Promise.reject(new Error('Google Maps JS is only available on web.'));
  }
  if (globalThis.google?.maps?.places) {
    return Promise.resolve(globalThis.google.maps.places);
  }
  if (mapsLoader) return mapsLoader;

  const apiKey = placesApiKey();
  if (!apiKey) {
    return Promise.reject(new Error('Address suggestions are unavailable.'));
  }

  mapsLoader = new Promise((resolve, reject) => {
    const callbackName = `__isentcareInitGooglePlaces_${Date.now()}`;
    const script = document.createElement('script');
    script.async = true;
    script.defer = true;
    script.src = `https://maps.googleapis.com/maps/api/js?key=${encodeURIComponent(apiKey)}&libraries=places&callback=${callbackName}`;

    const cleanup = () => {
      delete (globalThis as Record<string, unknown>)[callbackName];
      script.remove();
    };

    (globalThis as Record<string, unknown>)[callbackName] = () => {
      cleanup();
      const places = globalThis.google?.maps?.places;
      if (!places) {
        mapsLoader = null;
        reject(new Error('Google Places failed to initialize.'));
        return;
      }
      resolve(places);
    };

    script.onerror = () => {
      cleanup();
      mapsLoader = null;
      reject(new Error('Unable to load Google Places.'));
    };

    document.head.appendChild(script);
  });

  return mapsLoader;
}

async function fetchAddressSuggestionsWeb(
  query: string,
  signal?: AbortSignal,
): Promise<AddressSuggestion[]> {
  const places = await loadGooglePlaces();
  if (signal?.aborted) {
    throw new DOMException('Aborted', 'AbortError');
  }

  return new Promise((resolve, reject) => {
    const onAbort = () => reject(new DOMException('Aborted', 'AbortError'));
    signal?.addEventListener('abort', onAbort, { once: true });

    const service = new places.AutocompleteService();
    service.getPlacePredictions(
      {
        input: query,
        types: ['geocode'],
        componentRestrictions: { country: 'us' },
      },
      (predictions, status) => {
        signal?.removeEventListener('abort', onAbort);
        if (signal?.aborted) {
          reject(new DOMException('Aborted', 'AbortError'));
          return;
        }
        if (status === places.PlacesServiceStatus.ZERO_RESULTS) {
          resolve([]);
          return;
        }
        if (status !== places.PlacesServiceStatus.OK) {
          reject(new Error(`Address lookup failed (${status}).`));
          return;
        }
        resolve(
          (predictions ?? []).flatMap((prediction) => {
            const label = prediction.description?.trim();
            const id = prediction.place_id?.trim();
            return label && id ? [{ id, label }] : [];
          }),
        );
      },
    );
  });
}

async function fetchPlaceAddressDetailsWeb(placeId: string): Promise<PlaceAddressDetails> {
  const places = await loadGooglePlaces();
  return new Promise((resolve, reject) => {
    const attribution = document.createElement('div');
    const service = new places.PlacesService(attribution);
    service.getDetails(
      {
        placeId,
        fields: ['address_component', 'formatted_address', 'geometry'],
      },
      (place, status) => {
        if (status !== places.PlacesServiceStatus.OK || !place) {
          reject(new Error(`Address details failed (${status}).`));
          return;
        }
        resolve(detailsFromComponents(
          place.formatted_address || '',
          place.address_components ?? [],
          place.geometry?.location,
        ));
      },
    );
  });
}

async function fetchAddressSuggestionsNative(
  query: string,
  signal?: AbortSignal,
): Promise<AddressSuggestion[]> {
  const apiKey = placesApiKey();
  if (!apiKey) {
    throw new Error('Address suggestions are unavailable.');
  }

  const params = new URLSearchParams({
    input: query,
    types: 'geocode',
    components: 'country:us',
    key: apiKey,
  });
  const response = await fetch(
    `https://maps.googleapis.com/maps/api/place/autocomplete/json?${params.toString()}`,
    { signal },
  );
  if (!response.ok) {
    throw new Error(`Address lookup failed (HTTP ${response.status}).`);
  }

  const result = (await response.json()) as {
    status?: string;
    error_message?: string;
    predictions?: GooglePrediction[];
  };

  if (result.status && result.status !== 'OK' && result.status !== 'ZERO_RESULTS') {
    throw new Error(result.error_message || `Address lookup failed (${result.status}).`);
  }

  return (result.predictions ?? []).flatMap((prediction) => {
    const label = prediction.description?.trim();
    const id = prediction.place_id?.trim();
    return label && id ? [{ id, label }] : [];
  });
}

async function fetchPlaceAddressDetailsNative(placeId: string): Promise<PlaceAddressDetails> {
  const apiKey = placesApiKey();
  if (!apiKey) {
    throw new Error('Address suggestions are unavailable.');
  }

  const params = new URLSearchParams({
    place_id: placeId,
    fields: 'address_component,formatted_address,geometry',
    key: apiKey,
  });
  const response = await fetch(
    `https://maps.googleapis.com/maps/api/place/details/json?${params.toString()}`,
  );
  if (!response.ok) {
    throw new Error(`Address details failed (HTTP ${response.status}).`);
  }

  const result = (await response.json()) as {
    status?: string;
    error_message?: string;
    result?: {
      formatted_address?: string;
      address_components?: GoogleAddressComponent[];
      geometry?: { location?: { lat?: number; lng?: number } };
    };
  };

  if (result.status && result.status !== 'OK') {
    throw new Error(result.error_message || `Address details failed (${result.status}).`);
  }

  const location = result.result?.geometry?.location;
  return {
    ...detailsFromComponents(
      result.result?.formatted_address || '',
      result.result?.address_components ?? [],
    ),
    latitude: typeof location?.lat === 'number' ? location.lat : null,
    longitude: typeof location?.lng === 'number' ? location.lng : null,
  };
}

export async function fetchAddressSuggestions(
  query: string,
  signal?: AbortSignal,
): Promise<AddressSuggestion[]> {
  if (Platform.OS === 'web') {
    return fetchAddressSuggestionsWeb(query, signal);
  }
  return fetchAddressSuggestionsNative(query, signal);
}

export async function fetchPlaceAddressDetails(placeId: string): Promise<PlaceAddressDetails> {
  if (Platform.OS === 'web') {
    return fetchPlaceAddressDetailsWeb(placeId);
  }
  return fetchPlaceAddressDetailsNative(placeId);
}
