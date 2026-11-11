/** A number in Persian digits (۱۲۳). */
export function persian(value: number) {
  return new Intl.NumberFormat("fa-IR").format(value);
}
