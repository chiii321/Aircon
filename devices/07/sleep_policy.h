#pragma once

// Daily schedules repeat in Asia/Manila. A boundary already reached today
// belongs to tomorrow; runDailySchedule handles today's event before sleeping.
// C++11 constexpr: the body must be a single return statement (ESP32 core 2.x).
constexpr int inuvairBoundaryDelay(int secondOfDay, int boundaryMinute) {
  return boundaryMinute * 60 - secondOfDay > 0
      ? boundaryMinute * 60 - secondOfDay
      : boundaryMinute * 60 - secondOfDay + 86400;
}

constexpr bool inuvairScheduleNeedsActive(int secondOfDay, int onMinute, int offMinute, bool held) {
  return (!held && secondOfDay >= onMinute * 60 && secondOfDay < offMinute * 60)
      || secondOfDay == onMinute * 60 || secondOfDay == offMinute * 60
      || inuvairBoundaryDelay(secondOfDay, onMinute) <= 30
      || inuvairBoundaryDelay(secondOfDay, offMinute) <= 30;
}

constexpr bool inuvairIdlePowerSaving(unsigned long inactiveMs, bool scheduledUse) {
  return !scheduledUse && inactiveMs >= 10UL * 60UL * 1000UL;
}
