/**
 * Shared look for text inputs and selects so focus, error and disabled states are identical
 * everywhere. Focus shows a teal ring (red when the field is invalid); errors keep a red border.
 */
export function fieldClasses(invalid: boolean): string[] {
  return [
    'min-h-touch w-full rounded-xl border bg-white px-3.5 text-base text-navy-950 transition-[border-color,box-shadow]',
    'placeholder:text-navy-500/70 focus:outline-none focus-visible:ring-3',
    'disabled:cursor-not-allowed disabled:bg-cream-100 disabled:text-navy-500',
    invalid
      ? 'border-red-600 focus-visible:border-red-600 focus-visible:ring-red-600/25'
      : 'border-cream-300 hover:border-navy-500/40 focus-visible:border-brand-600 focus-visible:ring-brand-500/30',
  ]
}

/** Moves focus to the first invalid field after a failed submit (screen readers announce its error). */
export function focusFirstInvalid(root: HTMLElement | null | undefined): void {
  nextTick(() => root?.querySelector<HTMLElement>('[aria-invalid="true"]')?.focus())
}
