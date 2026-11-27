import type { CellSnapshot, CellValue } from '../types/schedule'

export function cellKey(employeeId: string, workDate: string): string {
  return `${employeeId}|${workDate}`
}

/** The comparable part of a cell (snapshot display fields excluded). */
export function toCellValue(cell: CellValue | null | undefined): CellValue | null {
  if (!cell) return null
  return {
    shiftCodeId: cell.shiftCodeId,
    startMinute: cell.startMinute,
    endMinute: cell.endMinute,
    breakMinutes: cell.breakMinutes,
    isCustomTime: cell.isCustomTime,
    note: cell.note,
  }
}

/** Value equality used for conflict detection (null = empty cell). */
export function sameCell(a: CellValue | null | undefined, b: CellValue | null | undefined): boolean {
  const x = toCellValue(a)
  const y = toCellValue(b)
  if (!x || !y) return x === y
  return x.shiftCodeId === y.shiftCodeId
    && x.startMinute === y.startMinute
    && x.endMinute === y.endMinute
    && x.breakMinutes === y.breakMinutes
    && x.isCustomTime === y.isCustomTime
    && (x.note ?? null) === (y.note ?? null)
}

/** Shift length in minutes; a shift ending at or before its start ends the next day. */
export function shiftDurationMinutes(startMinute: number, endMinute: number): number {
  const diff = endMinute - startMinute
  return diff > 0 ? diff : diff + 1440
}

export function snapshotEquals(a: CellSnapshot | null, b: CellSnapshot | null): boolean {
  return sameCell(a, b) && (a?.code === b?.code) && (a?.color === b?.color)
}

/** "HH:mm" for minutes after midnight (1440 → "24:00"). */
export function formatMinutes(minutes: number): string {
  return `${String(Math.floor(minutes / 60)).padStart(2, '0')}:${String(minutes % 60).padStart(2, '0')}`
}

export interface CellInputLike {
  shiftCodeId: string
  custom?: { startMinute: number, endMinute: number, breakMinutes: number } | null
  note?: string | null
}

export interface ShiftCodeLike {
  id: string
  code: string
  label: string
  kind: CellSnapshot['kind']
  color: string
  startMinute: number | null
  endMinute: number | null
  breakMinutes: number
}

/**
 * What a cell becomes for a given input: the code's default hours unless custom times are set.
 * Shared by the server (to store) and the client (to predict the saved value for concurrency).
 */
export function resolveCell(input: CellInputLike, code: ShiftCodeLike): CellSnapshot {
  const custom = input.custom ?? null
  return {
    shiftCodeId: code.id,
    code: code.code,
    label: code.label,
    kind: code.kind,
    color: code.color,
    startMinute: custom ? custom.startMinute : code.startMinute,
    endMinute: custom ? custom.endMinute : code.endMinute,
    breakMinutes: custom ? custom.breakMinutes : code.breakMinutes,
    isCustomTime: !!custom,
    note: input.note?.trim() || null,
  }
}
