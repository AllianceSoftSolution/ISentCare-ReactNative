/** Employment eligibility verification document path chosen by the professional. */
export type EevDocPath = 'IA' | 'BC';

/** API attachment group codes used for EEV packages. */
export type EevAttachmentGroup = 'IA' | 'ID' | 'AU';

export type EevCategorySelection = {
  id: number;
  name: string;
  category: EevAttachmentGroup | string;
};

/**
 * Ensures selected categories match the chosen IA (combined) or BC (ID + AU) path.
 * Returns an error message, or null when valid.
 */
export function eevPathMismatchMessage(
  path: EevDocPath,
  category1: EevCategorySelection | null | undefined,
  category2?: EevCategorySelection | null,
): string | null {
  if (!category1) {
    return path === 'IA'
      ? 'Select a document type that establishes both identity and employment eligibility.'
      : 'Select an identity document type.';
  }
  if (path === 'IA') {
    if (category1.category !== 'IA') {
      return 'Selected document type must establish both identity and employment eligibility.';
    }
    return null;
  }
  if (category1.category !== 'ID') {
    return 'Selected document type must be an identity document.';
  }
  if (!category2) {
    return 'Select an employment authorization document type.';
  }
  if (category2.category !== 'AU') {
    return 'Selected document type must be an employment authorization document.';
  }
  return null;
}
