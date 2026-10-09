#include "../devices/01/sleep_policy.h"

static_assert(inuvairBoundaryDelay(6 * 3600, 7 * 60) == 3600, "next morning event");
static_assert(inuvairBoundaryDelay(23 * 3600 + 59 * 60, 0) == 60, "midnight rollover");
static_assert(inuvairBoundaryDelay(7 * 3600, 7 * 60) == 86400, "already handled boundary");
static_assert(inuvairBoundaryDelay(7 * 3600 + 1, 7 * 60) == 86399, "past event belongs to tomorrow");
static_assert(inuvairBoundaryDelay(7 * 3600 - 30, 7 * 60) == 30, "pre-event wake");
static_assert(!inuvairIdlePowerSaving(599999, false), "not idle before ten minutes");
static_assert(inuvairIdlePowerSaving(600000, false), "idle after ten minutes");
static_assert(!inuvairIdlePowerSaving(0, false), "schedule edit or command restarts activity");
static_assert(!inuvairIdlePowerSaving(3600000, true), "active schedule prevents idle");
static_assert(inuvairScheduleNeedsActive(7 * 3600 - 30, 420, 540, false), "wake before ON");
static_assert(inuvairScheduleNeedsActive(8 * 3600, 420, 540, false), "stay active during window");
static_assert(inuvairScheduleNeedsActive(9 * 3600, 420, 540, false), "OFF boundary is active");
static_assert(!inuvairScheduleNeedsActive(10 * 3600, 420, 540, false), "unused after window");
static_assert(!inuvairScheduleNeedsActive(8 * 3600, 420, 540, true), "held window does not prevent idle");
static_assert(inuvairScheduleNeedsActive(86390, 0, 60, false), "wake for midnight event");
