export const HEADERS = ['User Email', 'Room Number', 'Day', 'Start Time', 'End Time', 'Class / Notes']
export const DAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday']

export function timeText(value) {
  if (typeof value === 'number' && value >= 0 && value < 1) {
    const minutes = Math.round(value * 1440)
    if (minutes >= 1440 || Math.abs(value * 1440 - minutes) > 0.001) return ''
    return `${String(Math.floor(minutes / 60)).padStart(2, '0')}:${String(minutes % 60).padStart(2, '0')}`
  }
  const match = String(value ?? '').trim().match(/^(\d{1,2}):(\d{2})(?::00)?$/)
  return match && Number(match[1]) < 24 && Number(match[2]) < 60 ? `${match[1].padStart(2, '0')}:${match[2]}` : ''
}

export function parseScheduleRows(matrix, users) {
  if (!matrix.length || HEADERS.some((header, i) => String(matrix[0][i] ?? '').trim() !== header)) {
    throw new Error('Use the template’s Schedule sheet and keep its six column headings unchanged.')
  }
  const rows = []
  const errors = []
  matrix.slice(1).forEach((cells, i) => {
    if (cells.every(value => value == null || String(value).trim() === '')) return
    if (rows.length >= 500) throw new Error('Use no more than 500 bookings per workbook.')
    const email = String(cells[0] ?? '').trim().toLowerCase()
    const room = String(cells[1] ?? '').trim()
    const day = DAYS.findIndex(value => value.toLowerCase() === String(cells[2] ?? '').trim().toLowerCase()) + 1
    const start = timeText(cells[3])
    const end = timeText(cells[4])
    const notes = String(cells[5] ?? '').trim()
    const row = { row: i + 2, email, room, day, start, end, notes }
    rows.push(row)
    const issues = []
    if (!users.some(user => user.email?.toLowerCase() === email && user.role === 'authorized')) issues.push('Email must belong to an approved authorized account')
    if (!/^\d{1,6}$/.test(room)) issues.push('Use a numeric room number, e.g. 301')
    if (!day) issues.push('Choose Monday–Sunday')
    if (!start || !end || start >= end) issues.push('Use 24-hour times with end after start')
    if (notes.length > 200) issues.push('Notes must be 200 characters or fewer')
    if (issues.length) errors.push(`Row ${row.row}: ${issues.join('; ')}.`)
  })
  if (!rows.length) throw new Error('The Schedule sheet has no bookings. Fill in at least one row.')
  for (let i = 0; i < rows.length; i++) for (let j = 0; j < i; j++) {
    const a = rows[i], b = rows[j]
    if (a.day && a.day === b.day && a.start && a.end && b.start && b.end && a.start < b.end && b.start < a.end && (a.email === b.email || a.room === b.room)) {
      errors.push(`Rows ${b.row} and ${a.row}: overlapping bookings for the same user or room.`)
    }
  }
  return { rows, errors }
}

export async function readScheduleFile(file, users) {
  if (!/\.xlsx$/i.test(file.name)) throw new Error('Choose an Excel .xlsx file using the INUVAIR template.')
  if (file.size > 2 * 1024 * 1024) throw new Error('The Excel file must be under 2 MB.')
  const XLSX = await import('./vendor/xlsx-0.20.3.mjs')
  const book = XLSX.read(await file.arrayBuffer(), { type: 'array', sheetRows: 502 })
  const sheet = book.Sheets.Schedule
  if (!sheet) throw new Error('The workbook must contain a sheet named Schedule.')
  if (sheet['!fullref'] && XLSX.utils.decode_range(sheet['!fullref']).e.r > 500) throw new Error('Use no more than 500 booking rows.')
  const matrix = XLSX.utils.sheet_to_json(sheet, { header: 1, raw: true, defval: '', blankrows: true })
  for (const [key, cell] of Object.entries(sheet)) {
    if (!key.startsWith('!') && cell.f) throw new Error('Use plain values in the Schedule sheet. Formulas are not accepted.')
  }
  return parseScheduleRows(matrix, users)
}
