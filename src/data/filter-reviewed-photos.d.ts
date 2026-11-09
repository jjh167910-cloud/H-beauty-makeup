export function filterReviewedPhotos(
  photos: Readonly<Record<string, string>>,
  quarantined: ReadonlyArray<{ id: string }>,
): Readonly<Record<string, string>>;
