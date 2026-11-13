import { Platform } from 'react-native';
import apiClient from '@/api/apiClient';

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

type PlacePredictionLike = {
  placeId?: string;
  text?: { toString: () => string };
  toPlace?: () => {
    fetchFields: (request: { fields: string[] }) => Promise<void>;
    formattedAddress?: string | null;
    addressComponents?: Array<{
      longText?: string | null;
      shortText?: string | null;
      types?: string[];
    }>;
    location?: { lat: () => number; lng: () => number } | null;
  };
};

type GoogleMapsPlaces = {
  AutocompleteSessionToken?: new () => object;
  AutocompleteSuggestion?: {
    fetchAutocompleteSuggestions: (request: {
      input: string;
      includedRegionCodes?: string[];
      includedPrimaryTypes?: string[];
      sessionToken?: object;
    }) => Promise<{ suggestions: Array<{ placePrediction?: PlacePredictionLike | null }> }>;
  };
  AutocompleteService?: new () => {
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
  PlacesServiceStatus?: {
    OK: string;
    ZERO_RESULTS: string;
  };
  PlacesService?: new (attributionContainer: HTMLElement) => {
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
  var google: {
    maps?: {
      places?: GoogleMapsPlaces;
      importLibrary?: (name: string) => Promise<GoogleMapsPlaces>;
    };
  } | undefined;
}

let mapsLoader: Promise<GoogleMapsPlaces> | null = null;
let autocompleteSessionToken: object | null = null;

function placesApiKey() {
  return process.env.EXPO_PUBLIC_GOOGLE_PLACES_API_KEY?.trim() || '';
}

export function hasPlacesApiKey() {
  // Suggestions can come from the backend Places proxy and/or a client Google key.
  return true;
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

function detailsFromNewPlaceComponents(
  formattedAddress: string,
  components: Array<{ longText?: string | null; shortText?: string | null; types?: string[] }> = [],
  location?: { lat?: () => number; lng?: () => number } | null,
): PlaceAddressDetails {
  const legacyComponents: GoogleAddressComponent[] = components.map((component) => ({
    long_name: component.longText || undefined,
    short_name: component.shortText || undefined,
    types: component.types,
  }));
  return detailsFromComponents(formattedAddress, legacyComponents, location);
}

function loadGooglePlaces(): Promise<GoogleMapsPlaces> {
  if (Platform.OS !== 'web') {
    return Promise.reject(new Error('Google Maps JS is only available on web.'));
  }
  if (typeof document === 'undefined') {
    return Promise.reject(new Error('Address suggestions are unavailable during server render.'));
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
    // loading=async is required by current Maps JS guidance.
    script.src = `https://maps.googleapis.com/maps/api/js?key=${encodeURIComponent(apiKey)}&libraries=places&loading=async&callback=${callbackName}`;

    const cleanup = () => {
      delete (globalThis as Record<string, unknown>)[callbackName];
      script.remove();
    };

    (globalThis as Record<string, unknown>)[callbackName] = async () => {
      try {
        const places = globalThis.google?.maps?.importLibrary
          ? await globalThis.google.maps.importLibrary('places')
          : globalThis.google?.maps?.places;
        cleanup();
        if (!places) {
          mapsLoader = null;
          reject(new Error('Google Places failed to initialize.'));
          return;
        }
        if (globalThis.google?.maps) {
          globalThis.google.maps.places = places;
        }
        resolve(places);
      } catch (loadError) {
        cleanup();
        mapsLoader = null;
        reject(loadError instanceof Error ? loadError : new Error('Google Places failed to initialize.'));
      }
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

function ensureAutocompleteSessionToken(places: GoogleMapsPlaces) {
  if (!autocompleteSessionToken && places.AutocompleteSessionToken) {
    autocompleteSessionToken = new places.AutocompleteSessionToken();
  }
  return autocompleteSessionToken;
}

function resetAutocompleteSessionToken() {
  autocompleteSessionToken = null;
}

async function fetchAddressSuggestionsNewApi(
  places: GoogleMapsPlaces,
  query: string,
): Promise<AddressSuggestion[] | null> {
  if (!places.AutocompleteSuggestion?.fetchAutocompleteSuggestions) {
    return null;
  }

  const sessionToken = ensureAutocompleteSessionToken(places);
  const { suggestions } = await places.AutocompleteSuggestion.fetchAutocompleteSuggestions({
    input: query,
    includedRegionCodes: ['us'],
    includedPrimaryTypes: ['geocode'],
    ...(sessionToken ? { sessionToken } : {}),
  });

  return suggestions.flatMap((suggestion) => {
    const prediction = suggestion.placePrediction;
    const label = prediction?.text?.toString()?.trim();
    const id = prediction?.placeId?.trim();
    return label && id ? [{ id, label }] : [];
  });
}

async function fetchAddressSuggestionsLegacyApi(
  places: GoogleMapsPlaces,
  query: string,
  signal?: AbortSignal,
): Promise<AddressSuggestion[]> {
  const AutocompleteService = places.AutocompleteService;
  const PlacesServiceStatus = places.PlacesServiceStatus;
  if (!AutocompleteService || !PlacesServiceStatus) {
    throw new Error('Address suggestions are unavailable.');
  }

  return new Promise((resolve, reject) => {
    const onAbort = () => reject(new DOMException('Aborted', 'AbortError'));
    signal?.addEventListener('abort', onAbort, { once: true });

    const service = new AutocompleteService();
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
        if (status === PlacesServiceStatus.ZERO_RESULTS) {
          resolve([]);
          return;
        }
        if (status !== PlacesServiceStatus.OK) {
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

async function fetchAddressSuggestionsWeb(
  query: string,
  signal?: AbortSignal,
): Promise<AddressSuggestion[]> {
  const places = await loadGooglePlaces();
  if (signal?.aborted) {
    throw new DOMException('Aborted', 'AbortError');
  }

  try {
    const modern = await fetchAddressSuggestionsNewApi(places, query);
    if (modern) return modern;
  } catch {
    // Fall back to the legacy AutocompleteService for older Maps JS projects.
  }

  return fetchAddressSuggestionsLegacyApi(places, query, signal);
}

async function fetchPlaceAddressDetailsWeb(placeId: string): Promise<PlaceAddressDetails> {
  const places = await loadGooglePlaces();

  // Prefer Place Details via the new Place class when available.
  if (globalThis.google?.maps?.importLibrary) {
    try {
      const placesLib = await globalThis.google.maps.importLibrary('places') as GoogleMapsPlaces & {
        Place?: new (options: { id: string }) => {
          fetchFields: (request: { fields: string[] }) => Promise<void>;
          formattedAddress?: string | null;
          addressComponents?: Array<{
            longText?: string | null;
            shortText?: string | null;
            types?: string[];
          }>;
          location?: { lat: () => number; lng: () => number } | null;
        };
      };
      if (placesLib.Place) {
        const place = new placesLib.Place({ id: placeId });
        await place.fetchFields({
          fields: ['formattedAddress', 'addressComponents', 'location'],
        });
        resetAutocompleteSessionToken();
        return detailsFromNewPlaceComponents(
          place.formattedAddress || '',
          place.addressComponents ?? [],
          place.location,
        );
      }
    } catch {
      // Fall through to legacy PlacesService.
    }
  }

  if (!places.PlacesService || !places.PlacesServiceStatus) {
    throw new Error('Address details are unavailable.');
  }

  return new Promise((resolve, reject) => {
    const attribution = document.createElement('div');
    const service = new places.PlacesService!(attribution);
    service.getDetails(
      {
        placeId,
        fields: ['address_component', 'formatted_address', 'geometry'],
      },
      (place, status) => {
        if (status !== places.PlacesServiceStatus!.OK || !place) {
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

type PlacesAutocompleteResponse = {
  status?: string;
  error_message?: string;
  details?: string;
  predictions?: GooglePrediction[];
};

type PlacesDetailsResponse = {
  status?: string;
  error_message?: string;
  details?: string;
  result?: {
    formatted_address?: string;
    address_components?: GoogleAddressComponent[];
    geometry?: { location?: { lat?: number; lng?: number } };
  };
};

function mapPredictions(predictions: GooglePrediction[] | undefined): AddressSuggestion[] {
  return (predictions ?? []).flatMap((prediction) => {
    const label = prediction.description?.trim();
    const id = prediction.place_id?.trim();
    return label && id ? [{ id, label }] : [];
  });
}

async function fetchAddressSuggestionsViaBackend(
  query: string,
  signal?: AbortSignal,
): Promise<AddressSuggestion[]> {
  const response = await apiClient.get<PlacesAutocompleteResponse>(
    '/places/autocomplete/',
    { input: query },
    signal ? { signal } as never : undefined,
  );
  if (!response.ok) {
    throw new Error(
      (typeof response.data?.details === 'string' && response.data.details)
      || (typeof response.data?.error_message === 'string' && response.data.error_message)
      || `Address lookup failed (HTTP ${response.status || 'network'}).`,
    );
  }

  const result = response.data ?? {};
  if (result.status && result.status !== 'OK' && result.status !== 'ZERO_RESULTS') {
    throw new Error(result.error_message || `Address lookup failed (${result.status}).`);
  }
  return mapPredictions(result.predictions);
}

async function fetchPlaceAddressDetailsViaBackend(placeId: string): Promise<PlaceAddressDetails> {
  const response = await apiClient.get<PlacesDetailsResponse>(
    '/places/details/',
    { place_id: placeId },
  );
  if (!response.ok) {
    throw new Error(
      (typeof response.data?.details === 'string' && response.data.details)
      || (typeof response.data?.error_message === 'string' && response.data.error_message)
      || `Address details failed (HTTP ${response.status || 'network'}).`,
    );
  }

  const result = response.data ?? {};
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

async function fetchAddressSuggestionsGoogleRest(
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

  const result = (await response.json()) as PlacesAutocompleteResponse;
  if (result.status && result.status !== 'OK' && result.status !== 'ZERO_RESULTS') {
    throw new Error(result.error_message || `Address lookup failed (${result.status}).`);
  }
  return mapPredictions(result.predictions);
}

async function fetchPlaceAddressDetailsGoogleRest(placeId: string): Promise<PlaceAddressDetails> {
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

  const result = (await response.json()) as PlacesDetailsResponse;
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
  // Prefer server proxy so Android doesn't need to resolve maps.googleapis.com.
  try {
    return await fetchAddressSuggestionsViaBackend(query, signal);
  } catch (backendError) {
    if (Platform.OS === 'web') {
      try {
        return await fetchAddressSuggestionsWeb(query, signal);
      } catch {
        throw backendError instanceof Error
          ? backendError
          : new Error('Address lookup failed.');
      }
    }
    try {
      return await fetchAddressSuggestionsGoogleRest(query, signal);
    } catch {
      throw backendError instanceof Error
        ? backendError
        : new Error('Address lookup failed.');
    }
  }
}

export async function fetchPlaceAddressDetails(placeId: string): Promise<PlaceAddressDetails> {
  try {
    return await fetchPlaceAddressDetailsViaBackend(placeId);
  } catch (backendError) {
    if (Platform.OS === 'web') {
      try {
        return await fetchPlaceAddressDetailsWeb(placeId);
      } catch {
        throw backendError instanceof Error
          ? backendError
          : new Error('Address details failed.');
      }
    }
    try {
      return await fetchPlaceAddressDetailsGoogleRest(placeId);
    } catch {
      throw backendError instanceof Error
        ? backendError
        : new Error('Address details failed.');
    }
  }
}
