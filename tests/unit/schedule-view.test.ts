import { describe, expect, it } from 'vitest'
import { cellHours, dayTotals, describeCell, groupSchedule, legendCodes, parseWeekParam } from '../../app/utils/schedule-view'
import type { ScheduleCell, ScheduleDepartment, ScheduleEmployee, ScheduleShiftCode } from '../../shared/types/schedule'
import { weekDays } from '../../shared/utils/week'

const days = weekDays('2026-11-23')
const dept = (id: string, sortOrder: number): ScheduleDepartment => ({ id, name: id, color: '#24466F', sortOrder, isActive: true })
const emp = (id: string, departmentId: string | null, sortOrder = 0): ScheduleEmployee => ({ id, firstName: id, lastName: 'Örnek', departmentId, sortOrder, isActive: true })
const cell = (employeeId: string, workDate: string, kind: ScheduleCell['kind'] = 'WORK', extra: Partial<ScheduleCell> = {}): ScheduleCell => ({
  employeeId, workDate, kind, shiftCodeId: kind, code: kind === 'WORK' ? 'A' : 'OFF', label: kind === 'WORK' ? 'Sabah' : 'Haftalık izin', color: '#8EDFE3',
  startMinute: kind === 'WORK' ? 480 : null, endMinute: kind === 'WORK' ? 960 : null, breakMinutes: 0, isCustomTime: false, note: null, ...extra,
})

describe('groupSchedule', () => {
  // The server already sorts employees (department order, then position); grouping must keep it.
  const view = {
    days,
    departments: [dept('salon', 1), dept('mutfak', 2)],
    employees: [emp('defne', 'salon'), emp('emir', 'salon', 1), emp('nehir', 'mutfak'), emp('serra', null)],
    cells: [cell('defne', days[0]!), cell('emir', days[0]!, 'OFF'), cell('nehir', days[0]!), cell('nehir', days[6]!)],
  }

  it('groups by department in department order, staff without a department last', () => {
    const groups = groupSchedule(view)
    expect(groups.map(g => g.department?.id ?? null)).toEqual(['salon', 'mutfak', null])
    expect(groups[0]!.rows.map(r => r.employee.id)).toEqual(['defne', 'emir'])
  })

  it('places cells on their weekday and counts working shifts per group', () => {
    const [salon, mutfak] = groupSchedule(view)
    expect(salon!.rows[0]!.cells.map(c => c?.code ?? null)).toEqual(['A', null, null, null, null, null, null])
    expect(salon!.working).toEqual([1, 0, 0, 0, 0, 0, 0])
    expect(mutfak!.working).toEqual([1, 0, 0, 0, 0, 0, 1])
  })

  it('treats a department the user cannot see as no department', () => {
    const groups = groupSchedule({ ...view, departments: [], employees: [emp('defne', 'gone')], cells: [] })
    expect(groups).toHaveLength(1)
    expect(groups[0]!.department).toBeNull()
  })
})

describe('dayTotals', () => {
  it('counts working, off and empty cells per day', () => {
    const groups = groupSchedule({
      days,
      departments: [],
      employees: [emp('a', null), emp('b', null), emp('c', null)],
      cells: [cell('a', days[0]!), cell('b', days[0]!, 'OFF')],
    })
    const totals = dayTotals(groups)
    expect(totals[0]).toEqual({ working: 1, off: 1, empty: 1 })
    expect(totals[1]).toEqual({ working: 0, off: 0, empty: 3 })
  })
})

describe('working counts', () => {
  it('count only WORK shifts; OFF, R (SICK) and Y.İ (LEAVE) are not working, empty cells are separate', () => {
    const groups = groupSchedule({
      days,
      departments: [dept('salon', 1), dept('mutfak', 2)],
      employees: [emp('a', 'salon'), emp('b', 'salon'), emp('c', 'salon'), emp('d', 'mutfak'), emp('e', 'mutfak')],
      cells: [
        cell('a', days[0]!, 'WORK'),
        cell('b', days[0]!, 'SICK', { code: 'R', label: 'Raporlu' }),
        cell('c', days[0]!, 'LEAVE', { code: 'Y.İ', label: 'Yıllık izin' }),
        cell('d', days[0]!, 'OFF'),
        // e has no cell on Monday.
      ],
    })
    expect(groups.map(g => g.working[0])).toEqual([1, 0])
    expect(dayTotals(groups)[0]).toEqual({ working: 1, off: 3, empty: 1 })
  })
})

describe('cell text', () => {
  it('formats hours, including shifts that cross midnight', () => {
    expect(cellHours({ startMinute: 480, endMinute: 960 })).toBe('08:00–16:00')
    expect(cellHours({ startMinute: 1320, endMinute: 360 })).toBe('22:00–06:00')
    expect(cellHours({ startMinute: null, endMinute: null })).toBeNull()
  })

  it('describes cells for screen readers', () => {
    expect(describeCell(null)).toBe('Boş')
    expect(describeCell(cell('a', days[0]!, 'WORK', { isCustomTime: true, startMinute: 540 }))).toBe('Sabah, 09:00–16:00, özel saat')
    expect(describeCell(cell('a', days[0]!, 'OFF'))).toBe('Haftalık izin')
  })
})

describe('legendCodes', () => {
  const code = (id: string, sortOrder: number, isActive = true): ScheduleShiftCode => ({ id, code: id, label: id, kind: 'WORK', color: '#8EDFE3', startMinute: null, endMinute: null, breakMinutes: 0, sortOrder, isActive })
  it('lists active codes and inactive codes still used, in code order', () => {
    const codes = [code('B', 2), code('A', 1), code('X', 3, false), code('Z', 4, false)]
    expect(legendCodes(codes, [{ shiftCodeId: 'X' }]).map(c => c.id)).toEqual(['A', 'B', 'X'])
  })
})

describe('parseWeekParam', () => {
  it('normalizes any day to its Monday and rejects bad input', () => {
    expect(parseWeekParam('2026-11-26')).toBe('2026-11-23')
    expect(parseWeekParam('2026-02-30')).toBeNull()
    expect(parseWeekParam('yarın')).toBeNull()
    expect(parseWeekParam(undefined)).toBeNull()
  })
})
