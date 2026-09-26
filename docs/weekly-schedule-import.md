# Weekly room schedule import

Admins can download the Excel template from Scheduling, fill its `Schedule` sheet, upload it, preview validation results, map each room number to a controller, and save weekly bookings. One row describes one user, room, weekday and time slot. The same controller may be used by different authorized users at different times.

Columns: `User Email`, `Room Number`, `Day`, `Start Time`, `End Time`, `Class / Notes`. Preserve these headings. Emails must match approved authorized accounts. Use Monday–Sunday and 24-hour times in Asia/Manila. Native Excel time cells are accepted. End must follow start on the same day. Notes are optional, up to 200 characters. Replace the template's sample email before importing.

Only `.xlsx` files up to 2 MB and 500 booking rows are accepted. Formula cells in the Schedule sheet are rejected. Overlapping slots for the same user or controller are rejected by both the importer and the database. Room-to-controller mappings must remain consistent with saved bookings. The entire save is atomic: an invalid booking saves nothing.

Imports add bookings; exact duplicate slots are skipped. They do not replace saved bookings. Remove an old booking from the saved list before importing its replacement. Deleting all bookings for a user restores their existing manual device assignments.

Populated cells outside the six template columns, unreadable text/control characters and unsupported values are rejected. The preview shows only rows that pass field and overlap checks; any workbook errors block the whole import. After controller mapping and saved-booking checks, a confirmation dialog lists exactly the verified values to send and explains their effect on weekly room access. Canceling sends nothing. The server revalidates the final request before writing anything.

For accounts with weekly bookings, database access rules allow only controllers in the current weekday/time slot: start is inclusive, end is exclusive. Other accounts retain their manual device assignments. Admins retain full access. Approval is required for either assignment mode. Dashboard refresh normally updates visibility every eight seconds. Class check-in responses require current room access.

Weekly bookings control authorized-user visibility and check-in access. They do not create AC commands or change daily ESP32 timers. Automatic weekly AC execution would require separate firmware and server work.

The browser reads the workbook locally with vendored SheetJS CE 0.20.3 (`web/vendor/SHEETJS-LICENSE`). Only validated booking values are sent to the admin import RPC. The new table enables RLS, denies direct authenticated writes, and permits admin reads. Admin import/removal RPCs check the caller on the server.

Validation: `tests/schedule-import.cjs` covers real XLSX parsing, native time cells, invalid times, overlap detection, formula rejection, controller mapping, save payload, mobile layout, accessibility and restricted navigation. Database transaction checks cover duplicate imports, conflict rollback, admin authorization, current-slot visibility, RLS and check-in responses without leaving test records.
