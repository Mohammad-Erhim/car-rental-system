import type { CategoryView, FeatureView } from '@/lib/admin-hooks';

export type Transmission = 'automatic' | 'manual';
export type FeatureGroup = FeatureView['group'];

export const FEATURE_GROUPS: FeatureGroup[] = ['comfort', 'safety', 'tech', 'utility'];

export const CATEGORY_CODE = /^[a-z0-9_]{2,40}$/;
export const FEATURE_CODE = /^[a-z0-9_]{2,60}$/;

/** Number inputs are edited as text; keep only digits so the field can never hold "1e3" or "-". */
export const digitsOnly = (v: string) => v.replace(/\D/g, '');

/** the form's shape: numbers stay strings until submit so an empty field is representable */
export interface CategoryValues {
  code: string;
  class: string;
  displayName: string;
  description: string;
  passengers: string;
  luggage: string;
  doors: string;
  transmission: Transmission;
  sortOrder: string;
  featureCodes: string[];
  imageRef: string | null;
  imageUrl: string | null;
}

export const emptyCategory = (): CategoryValues => ({
  code: '',
  class: '',
  displayName: '',
  description: '',
  passengers: '5',
  luggage: '2',
  doors: '4',
  transmission: 'automatic',
  sortOrder: '0',
  featureCodes: [],
  imageRef: null,
  imageUrl: null,
});

export const categoryValues = (c: CategoryView): CategoryValues => ({
  code: c.code,
  class: c.class,
  displayName: c.displayName,
  description: c.description ?? '',
  passengers: String(c.passengers),
  luggage: String(c.luggage),
  doors: String(c.doors),
  transmission: c.transmission,
  sortOrder: String(c.sortOrder),
  featureCodes: c.features.map((f) => f.code),
  imageRef: c.imageRef,
  imageUrl: c.imageUrl,
});

/** inclusive whole-number ranges the API enforces */
export const LIMITS = {
  passengers: [1, 60],
  luggage: [0, 30],
  doors: [2, 8],
} as const;

export const inRange = (value: string, [min, max]: readonly [number, number]) => {
  const n = Number(value);
  return value.trim() !== '' && Number.isInteger(n) && n >= min && n <= max;
};

/** Features grouped for display, in the API's order; a group with no features is left out. */
export function groupFeatures<T extends { group: FeatureGroup }>(features: T[]) {
  return FEATURE_GROUPS.map((group) => ({
    group,
    features: features.filter((f) => f.group === group),
  })).filter((g) => g.features.length);
}

export interface FeatureValues {
  code: string;
  label: string;
  group: FeatureGroup;
  sortOrder: string;
}

export const emptyFeature = (): FeatureValues => ({
  code: '',
  label: '',
  group: 'comfort',
  sortOrder: '0',
});

export const featureValues = (f: FeatureView): FeatureValues => ({
  code: f.code,
  label: f.label,
  group: f.group,
  sortOrder: String(f.sortOrder),
});
