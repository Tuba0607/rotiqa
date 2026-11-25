/**
 * Rotiqa design tokens — the single source of truth for colors shared by the
 * web UI and the server-rendered schedule image. `app/assets/css/main.css`
 * mirrors these values as Tailwind tokens; a unit test keeps both in sync.
 *
 * Shift and department colors here are only defaults: organizations can
 * override them per shift code and per department (stored as hex values).
 */

export const BRAND_COLORS = {
  navy: '#0A1628',
  darkBlue: '#13294B',
  teal: '#14B8A6',
  cream: '#F8F6F1',
  amber: '#F59E0B',
  white: '#FFFFFF',
} as const

/** Default cell fill per starter shift code. */
export const SHIFT_COLORS = {
  'A': '#8EDFE3', // Sabah — light turquoise
  'B': '#F8CE67', // Ara — warm yellow
  'C': '#E77B66', // Akşam — coral
  'OFF': '#F8E4E4', // Haftalık izin — light pink
  'R': '#DC3545', // Raporlu — red
  'Y.İ': '#DCCAF5', // Yıllık izin — light lilac
} as const

/**
 * Default department colors for the employee name column, assigned in order
 * to new departments. All carry white text at ≥ 7:1 contrast.
 */
export const DEPARTMENT_COLORS = [
  '#60427E', // purple   (e.g. Salon)
  '#24466F', // dark blue (e.g. Mutfak)
  '#1E5F5A', // deep teal (e.g. Bar)
  '#7A4419', // brown    (e.g. Ön büro / Kasa)
  '#5A3350', // plum     (e.g. Kat hizmetleri)
  '#3A4A5C', // slate    (fallback / other)
] as const

/** Surfaces of the schedule sheet (grid and shared image). */
export const SHEET_COLORS = {
  frame: '#1F4A57', // image background behind the table
  grid: '#0A1628', // table lines
  dayNumber: '#13294B', // header cells with the day number
  weekday: '#F59E0B', // weekday name band (Mon–Fri)
  weekend: '#286573', // weekday name band (Sat–Sun)
} as const
