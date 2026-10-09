/*
  Stage 1 hardware test for ESP32-WROOM-32.
  ELECTRA_AC raw control and replay diagnostics. Physical response unverified.
  Current transmitter: harvested IR LED from the previous 3-pin module.
*/

#include <Arduino.h>
#include <DHT.h>
#include <IRremoteESP8266.h>
#include <IRrecv.h>
#include <IRsend.h>
#include <IRutils.h>
#include <ArduinoJson.h>
#include <HTTPClient.h>
#include <Preferences.h>
#include <WiFi.h>
#include <WiFiClientSecure.h>
#include <time.h>
#include <esp_sleep.h>
#include "sleep_policy.h"
#include "device_credentials.h"
#include "supabase_root_ca.h"

#define DHT_PIN 32
#define DHT_TYPE DHT22
#define IR_RECEIVE_PIN 27
#define IR_SEND_PIN 25
// Change this and provision a separate token before flashing another controller.
constexpr char kDeviceId[] = "01";
constexpr char kSyncUrl[] = "https://jvdudsbtcjojbgtanbzo.supabase.co/functions/v1/device-sync";
constexpr char kPublishableKey[] = "sb_publishable_B4ZZZ62G7PF8sNcKGxWA0A_MKmvhTcF";
constexpr uint32_t kPollIntervalMs = 5000;
constexpr uint32_t kReconnectIntervalMs = 10000;
constexpr uint16_t kMaxSchedules = 512;
#ifndef INUVAIR_DEEP_SLEEP
#define INUVAIR_DEEP_SLEEP 0  // USB mode: remain connected for automatic schedule updates.
#endif
bool cloudSynced = false;
RTC_DATA_ATTR time_t pendingBoundary = 0;

#ifndef IR_SEND_INVERTED
#define IR_SEND_INVERTED false  // Set true only for a confirmed active-LOW driver.
#endif
constexpr uint16_t kRawReplayKhz = 38;  // Receiver cannot measure carrier frequency.
const char kCommands[] = "status, dht, on, off, testir, capture, replay";
bool capturePending = false;
uint32_t captureStartedMs = 0;
uint16_t* capturedRaw = nullptr;
uint16_t capturedRawLength = 0;

constexpr uint16_t kCaptureBufferSize = 1024;
constexpr uint8_t kCaptureTimeoutMs = 50;

DHT dht(DHT_PIN, DHT_TYPE);
IRrecv irReceiver(IR_RECEIVE_PIN, kCaptureBufferSize, kCaptureTimeoutMs, true);
IRsend irSender(IR_SEND_PIN, IR_SEND_INVERTED);
decode_results irResults;
unsigned long lastDhtReadMs = 0;
constexpr unsigned long kDhtIntervalMs = 2000;

Preferences settings;
float lastTemperatureC = NAN;
float lastHumidityPct = NAN;
uint32_t lastPollMs = 0;
uint32_t lastReconnectMs = 0;
int lastScheduleMinute = -1;
struct DailyWindow { uint16_t onMinute; uint16_t offMinute; uint8_t weekday; };
DailyWindow schedules[kMaxSchedules];
uint16_t scheduleCount = 0;
bool scheduleHeld = false;

uint32_t lastActivityMs = 0;
bool idlePowerSaving = false;

void noteActivity() {
  lastActivityMs = millis();
  if (idlePowerSaving && WiFi.setSleep(false)) {
    idlePowerSaving = false;
    Serial.println("INUVAIR active: schedule or command received.");
  }
}

void updateIdlePowerSaving() {
  if (INUVAIR_DEEP_SLEEP) return;
  bool scheduledUse = false;
  const time_t now = time(nullptr);
  if (now >= 1700000000) {
    struct tm localTime;
    localtime_r(&now, &localTime);
    const int seconds = (localTime.tm_hour * 60 + localTime.tm_min) * 60 + localTime.tm_sec;
    for (uint16_t i = 0; i < scheduleCount; ++i) {
      if (schedules[i].weekday && schedules[i].weekday != (localTime.tm_wday ? localTime.tm_wday : 7)) continue;
      if (inuvairScheduleNeedsActive(seconds, schedules[i].onMinute, schedules[i].offMinute, scheduleHeld)) scheduledUse = true;
    }
  }
  if (scheduledUse) lastActivityMs = millis();
  const bool idle = inuvairIdlePowerSaving(uint32_t(millis() - lastActivityMs), scheduledUse);
  if (idle != idlePowerSaving && WiFi.setSleep(idle)) {
    idlePowerSaving = idle;
    Serial.println(idle ? "INUVAIR idle: Wi-Fi modem sleep, still reachable." : "INUVAIR active: scheduled window.");
  }
}



// Latest ELECTRA_AC ON/OFF captures supplied by the user (104-bit frames, 211 timings each).
// Raw replay is used so the captured timing pattern is preserved exactly.
const uint16_t kElectraOnRaw[] = {
    9098, 4410, 644, 1604, 644, 1602, 646, 464, 644, 472, 638, 494, 616, 466, 644, 1602,
    648, 1602, 644, 466, 642, 466, 644, 466, 644, 1604, 644, 468, 642, 468, 642, 468,
    644, 1602, 646, 466, 642, 466, 644, 466, 644, 466, 644, 466, 644, 1604, 644, 1604,
    644, 1602, 646, 466, 644, 468, 642, 466, 644, 466, 644, 464, 644, 466, 644, 466,
    642, 468, 644, 466, 642, 466, 644, 468, 642, 466, 644, 468, 642, 468, 642, 1604,
    644, 468, 640, 468, 644, 466, 642, 466, 642, 466, 642, 468, 644, 468, 642, 468,
    642, 468, 642, 466, 644, 468, 642, 468, 642, 468, 644, 466, 642, 1604, 644, 466,
    642, 466, 644, 466, 642, 468, 642, 466, 644, 468, 642, 466, 642, 468, 642, 468,
    642, 466, 642, 468, 642, 468, 640, 468, 644, 466, 642, 468, 642, 470, 640, 468,
    642, 468, 642, 468, 642, 468, 642, 468, 642, 468, 644, 466, 642, 1604, 642, 468,
    642, 468, 642, 468, 640, 470, 642, 468, 640, 470, 640, 470, 640, 470, 640, 470,
    640, 470, 640, 1606, 640, 470, 640, 1606, 642, 468, 640, 470, 616, 494, 640, 470,
    616, 494, 616, 496, 616, 494, 616, 494, 614, 494, 616, 1632, 616, 1632, 616, 492,
    616, 1632, 618
};

const uint16_t kElectraOffRaw[] = {
    9096, 4412, 642, 1604, 642, 1606, 644, 468, 642, 468, 640, 468, 642, 470, 640, 1606,
    642, 1604, 644, 468, 640, 470, 638, 470, 640, 1608, 640, 468, 642, 468, 640, 470,
    638, 1608, 642, 470, 638, 468, 642, 470, 638, 470, 640, 468, 640, 1608, 640, 1606,
    642, 1606, 640, 470, 640, 470, 638, 472, 640, 470, 638, 470, 640, 470, 640, 470,
    638, 470, 640, 468, 640, 470, 638, 470, 640, 470, 638, 470, 642, 468, 640, 1608,
    638, 472, 640, 470, 640, 468, 640, 470, 642, 468, 640, 470, 640, 468, 640, 468,
    640, 470, 640, 470, 640, 468, 640, 470, 640, 470, 638, 470, 640, 1606, 640, 470,
    640, 470, 640, 468, 642, 468, 642, 468, 640, 470, 640, 470, 640, 470, 640, 468,
    640, 470, 642, 468, 640, 468, 640, 470, 640, 470, 640, 470, 640, 470, 640, 470,
    640, 470, 640, 468, 640, 470, 640, 470, 640, 468, 642, 468, 640, 468, 642, 470,
    640, 470, 640, 468, 640, 472, 640, 470, 638, 470, 640, 468, 640, 470, 640, 468,
    640, 470, 640, 1608, 640, 470, 638, 1608, 638, 472, 638, 470, 640, 470, 640, 470,
    640, 470, 638, 470, 640, 470, 638, 472, 614, 496, 640, 1606, 614, 496, 638, 472,
    638, 1608, 638
};

const uint8_t kElectraOnState[13] = {
    0xC3, 0x88, 0xE0, 0x00, 0x40, 0x00, 0x20, 0x00, 0x00, 0x20, 0x00, 0x05, 0xB0
};

const uint8_t kElectraOffState[13] = {
    0xC3, 0x88, 0xE0, 0x00, 0x40, 0x00, 0x20, 0x00, 0x00, 0x00, 0x00, 0x05, 0x90
};

static_assert(sizeof(kElectraOnRaw) / sizeof(kElectraOnRaw[0]) == 211,
              "ELECTRA ON capture must contain all 211 recorded timings.");
static_assert(sizeof(kElectraOffRaw) / sizeof(kElectraOffRaw[0]) == 211,
              "ELECTRA OFF capture must contain all 211 recorded timings.");
static_assert(sizeof(kElectraOnState) / sizeof(kElectraOnState[0]) == 13,
              "ELECTRA ON state must contain 13 bytes.");
static_assert(sizeof(kElectraOffState) / sizeof(kElectraOffState[0]) == 13,
              "ELECTRA OFF state must contain 13 bytes.");

void printDht() {
  if (capturePending) {
    Serial.println("DHT paused during capture to avoid interrupting IR timings.");
    return;
  }
  const float humidity = dht.readHumidity();
  const float temperatureC = dht.readTemperature();

  if (isnan(humidity) || isnan(temperatureC)) {
    lastHumidityPct = NAN;
    lastTemperatureC = NAN;
    Serial.println("DHT22 read failed. Check wiring and any required DATA pull-up resistor.");
    return;
  }

  lastHumidityPct = humidity;
  lastTemperatureC = temperatureC;
  Serial.printf("DHT22: %.1f C, %.1f %% RH\n", temperatureC, humidity);
}

bool sendAuxState(bool turnOn) {
  noteActivity();
  if (capturePending) {
    Serial.println("Capture is armed; wait for the remote or the 60-second timeout before sending.");
    return false;
  }
  irReceiver.disableIRIn();
  if (turnOn) {
    irSender.sendRaw(kElectraOnRaw, sizeof(kElectraOnRaw) / sizeof(kElectraOnRaw[0]), kRawReplayKhz);
  } else {
    irSender.sendRaw(kElectraOffRaw, sizeof(kElectraOffRaw) / sizeof(kElectraOffRaw[0]), kRawReplayKhz);
  }
  delay(100);
  irReceiver.enableIRIn();
  if (turnOn) {
    Serial.printf("Sent captured ELECTRA_AC ON raw frame (%u timings at %u kHz). AC response is not yet verified.\n",
                  static_cast<unsigned int>(sizeof(kElectraOnRaw) / sizeof(kElectraOnRaw[0])), kRawReplayKhz);
  } else {
    Serial.printf("Sent captured ELECTRA_AC OFF raw frame (%u timings at %u kHz). AC response is not yet verified.\n",
                  static_cast<unsigned int>(sizeof(kElectraOffRaw) / sizeof(kElectraOffRaw[0])), kRawReplayKhz);
  }
  return true;
}
void testIrLed() {
  if (capturePending) {
    Serial.println("Capture is armed; wait for the remote or the 60-second timeout before sending.");
    return;
  }
  static const uint16_t pulse[] = {5000, 5000};  // 5 ms 38 kHz burst, 5 ms off
  irReceiver.disableIRIn();
  for (uint8_t i = 0; i < 8; ++i) {
    irSender.sendRaw(pulse, 2, kRawReplayKhz);
    delay(100);
  }
  irReceiver.enableIRIn();
  Serial.println("IR LED test bursts sent. Camera visibility depends on the camera and LED.");
}

void captureNext() {
  delete[] capturedRaw;
  capturedRaw = nullptr;
  capturedRawLength = 0;
  irReceiver.resume();
  capturePending = true;
  captureStartedMs = millis();
  Serial.println("Capture armed for 60 seconds. Press the original remote once. DHT reads paused.");
}

void replayCaptured() {
  if (capturePending || capturedRaw == nullptr || capturedRawLength == 0) {
    Serial.println("No completed raw capture. Use capture, then press the original remote.");
    return;
  }
  irReceiver.disableIRIn();
  irSender.sendRaw(capturedRaw, capturedRawLength, kRawReplayKhz);
  delay(100);
  irReceiver.enableIRIn();
  Serial.printf("Replayed %u raw timings at %u kHz. Check the actual AC response.\n",
                capturedRawLength, kRawReplayKhz);
}

int parseMinute(const String& value) {
  if (value.length() < 5 || value[2] != ':') return -1;
  for (uint8_t i : {uint8_t(0), uint8_t(1), uint8_t(3), uint8_t(4)}) {
    if (value[i] < '0' || value[i] > '9') return -1;
  }
  const int hour = (value[0] - '0') * 10 + value[1] - '0';
  const int minute = (value[3] - '0') * 10 + value[4] - '0';
  return hour < 24 && minute < 60 ? hour * 60 + minute : -1;
}

void loadSchedules(JsonArrayConst items) {
  scheduleCount = 0;
  for (JsonObjectConst item : items) {
    if (scheduleCount >= kMaxSchedules) break;
    const int on = parseMinute(item["on_time"].as<String>());
    const int off = parseMinute(item["off_time"].as<String>());
    if (on < 0 || off <= on) continue;
    const int weekday = item["weekday"] | 0;
    if (weekday < 0 || weekday > 7) continue;
    schedules[scheduleCount++] = {uint16_t(on), uint16_t(off), uint8_t(weekday)};
  }
}

bool postCloud(const String& payload, String& response) {
  if (WiFi.status() != WL_CONNECTED) return false;
  WiFiClientSecure client;
  client.setCACert(kSupabaseRootCa);
  HTTPClient http;
  http.setConnectTimeout(5000);
  http.setTimeout(5000);
  if (!http.begin(client, kSyncUrl)) return false;
  http.addHeader("Content-Type", "application/json");
  http.addHeader("apikey", kPublishableKey);
  http.addHeader("x-device-id", kDeviceId);
  http.addHeader("x-device-token", DEVICE_TOKEN);
  const int code = http.POST(payload);
  if (code == 200) response = http.getString();
  else Serial.printf("Cloud request failed: HTTP %d\n", code);
  http.end();
  return code == 200;
}

void acknowledgeCommand(uint32_t id, bool sent) {
  JsonDocument request;
  request["type"] = "ack";
  request["command_id"] = id;
  request["status"] = sent ? "sent_ir" : "failed";
  String payload, response;
  serializeJson(request, payload);
  if (postCloud(payload, response)) Serial.printf("Command %lu acknowledgement submitted.\n", static_cast<unsigned long>(id));
}

void pollCloud() {
  JsonDocument request;
  request["type"] = "poll";
  request["power_mode"] = idlePowerSaving ? "modem_sleep" : "active";
  const int32_t wifiRssi = WiFi.RSSI();
  if (WiFi.status() == WL_CONNECTED && wifiRssi >= -127 && wifiRssi < 0) request["wifi_rssi"] = wifiRssi;
  else request["wifi_rssi"] = nullptr;
  if (isnan(lastTemperatureC)) request["temperature_c"] = nullptr;
  else request["temperature_c"] = lastTemperatureC;
  if (isnan(lastHumidityPct)) request["humidity_pct"] = nullptr;
  else request["humidity_pct"] = lastHumidityPct;
  String payload, response;
  serializeJson(request, payload);
  if (!postCloud(payload, response)) return;

  JsonDocument data;
  if (deserializeJson(data, response)) {
    Serial.println("Cloud JSON could not be parsed.");
    return;
  }
  cloudSynced = true;
  JsonArrayConst incoming = data["weekly_schedules"].is<JsonArrayConst>() ? data["weekly_schedules"].as<JsonArrayConst>() : data["schedules"].as<JsonArrayConst>();
  if (!incoming.isNull()) {
    String scheduleJson;
    serializeJson(incoming, scheduleJson);
    if (scheduleJson != settings.getString("schedules", "[]")) {
      settings.putString("schedules", scheduleJson);
      noteActivity();
    }
    loadSchedules(incoming);
  }
  if (!data["schedule_hold"].isNull()) {
    if (scheduleHeld != data["schedule_hold"].as<bool>()) noteActivity();
    scheduleHeld = data["schedule_hold"].as<bool>();
    settings.putBool("scheduleHold", scheduleHeld);
  }
  JsonObjectConst command = data["command"].as<JsonObjectConst>();
  if (!command.isNull()) {
    const uint32_t id = command["id"].as<uint32_t>();
    const String action = command["action"].as<String>();
    if (id && (action == "on" || action == "off")) {
      if (settings.getUInt("lastCommand", 0) == id) {
        acknowledgeCommand(id, true);
      } else {
        const uint32_t expiresAt = command["expires_at_epoch"].as<uint32_t>();
        const time_t now = time(nullptr);
        if (expiresAt && (now < 1700000000 || now >= expiresAt)) {
          Serial.println("Manual command expired or clock invalid; IR skipped.");
          acknowledgeCommand(id, false);
          return;
        }
        const bool sent = sendAuxState(action == "on");
        if (sent) settings.putUInt("lastCommand", id);
        acknowledgeCommand(id, sent);
      }
    }
  }
}

void runDailySchedule() {
  const time_t now = time(nullptr);
  if (now < 1700000000) return; // No valid NTP time yet.
  // A timer wake can reach the boundary while Wi-Fi is reconnecting.
  const time_t eventTime = pendingBoundary && now >= pendingBoundary && now - pendingBoundary <= 120
      ? pendingBoundary : now;
  if (pendingBoundary && now >= pendingBoundary) pendingBoundary = 0;
  struct tm localTime;
  localtime_r(&eventTime, &localTime);  const int minute = localTime.tm_hour * 60 + localTime.tm_min;
  if (minute == lastScheduleMinute) return;
  lastScheduleMinute = minute;
  const uint32_t eventKey = uint32_t(localTime.tm_year + 1900) * 1000000UL
      + uint32_t(localTime.tm_yday + 1) * 1440UL + minute;
  if (settings.getUInt("lastEvent", 0) == eventKey) return;
  for (uint16_t i = 0; i < scheduleCount; ++i) {
      if (schedules[i].weekday && schedules[i].weekday != (localTime.tm_wday ? localTime.tm_wday : 7)) continue;
    if (schedules[i].onMinute == minute || schedules[i].offMinute == minute) {
      const bool turnOn = schedules[i].onMinute == minute;
      if (turnOn && scheduleHeld) {
        settings.putUInt("lastEvent", eventKey);
        Serial.println("Schedule ON skipped because class schedule is paused.");
        break;
      }
      if (sendAuxState(turnOn)) {
        settings.putUInt("lastEvent", eventKey);
        Serial.println("Daily schedule boundary sent. Physical AC response remains unverified.");
        if (WiFi.status() == WL_CONNECTED) {
          JsonDocument event;
          event["type"] = "schedule_event";
          event["action"] = turnOn ? "on" : "off";
          String payload, response;
          serializeJson(event, payload);
          postCloud(payload, response);
        }
      }
      break;
    }
  }
}

void sleepWhenReady() {
  if (!INUVAIR_DEEP_SLEEP || capturePending || capturedRaw != nullptr) return;
  const time_t now = time(nullptr);
  const bool validClock = now >= 1700000000;
  // Bound connection and clock acquisition; cached schedules still work offline.
  if ((!cloudSynced || !validClock) && millis() < 30000) return;
  // Leave a brief online window for dashboard refresh and manual commands.
  if (cloudSynced && validClock && millis() < 20000) return;
  uint32_t seconds = cloudSynced && validClock ? 21600 : 120;
  time_t nextBoundary = 0;
  if (validClock) {
    struct tm localTime;
    localtime_r(&now, &localTime);
    const int secondOfDay = (localTime.tm_hour * 60 + localTime.tm_min) * 60 + localTime.tm_sec;
    int nearest = 86400;
    for (uint16_t i = 0; i < scheduleCount; ++i) {
      if (schedules[i].weekday && schedules[i].weekday != (localTime.tm_wday ? localTime.tm_wday : 7)) continue;
      nearest = min(nearest, inuvairBoundaryDelay(secondOfDay, schedules[i].onMinute));
      nearest = min(nearest, inuvairBoundaryDelay(secondOfDay, schedules[i].offMinute));
      if (secondOfDay >= schedules[i].onMinute * 60 && secondOfDay < schedules[i].offMinute * 60) seconds = min(seconds, uint32_t(60));
    }
    // Stay awake for a nearby boundary, without a blocking delay loop.
    if (nearest <= 45) return;
    const uint32_t earlyWake = uint32_t(nearest - 30);
    if (earlyWake <= seconds) {
      seconds = earlyWake;
      nextBoundary = now + nearest;
    }
  }
  pendingBoundary = nextBoundary;
  if (cloudSynced && WiFi.status() == WL_CONNECTED) {
    JsonDocument report;
    report["type"] = "sleep";
    report["sleep_seconds"] = seconds;
    String payload, response;
    serializeJson(report, payload);
    postCloud(payload, response);
  }
  Serial.printf("INUVAIR sleeping for %lu seconds. USB power; solar supply pending.\n", static_cast<unsigned long>(seconds));
  irReceiver.disableIRIn();
  WiFi.disconnect(true);
  WiFi.mode(WIFI_OFF);
  digitalWrite(IR_SEND_PIN, IR_SEND_INVERTED ? HIGH : LOW);
  esp_sleep_enable_timer_wakeup(uint64_t(seconds) * 1000000ULL);
  Serial.flush();
  esp_deep_sleep_start();
}

void printStatus() {
  Serial.println("Stage 1 website-connected hardware test");
  Serial.printf("Device ID: %s\n", kDeviceId);
  Serial.printf("DHT22 GPIO: %d | IR receiver GPIO: %d | IR transmitter GPIO: %d\n",
                DHT_PIN, IR_RECEIVE_PIN, IR_SEND_PIN);
  Serial.printf("Wi-Fi: %s | cached schedule windows: %u\n",
                WiFi.status() == WL_CONNECTED ? "connected" : "offline", scheduleCount);
  Serial.println("ELECTRA_AC ON/OFF: captured raw frames (104-bit, 211 timings each; AC response not yet verified)");
  Serial.println("ON state:  C388E0004000200000200005B0");
  Serial.println("OFF state: C388E000400020000000000590");
  Serial.printf("IR TX inverted: %s | raw replay carrier: %u kHz | captured timings: %u\n",
                IR_SEND_INVERTED ? "yes" : "no", kRawReplayKhz, capturedRawLength);
  Serial.printf("Build: %s %s\n", __DATE__, __TIME__);
  Serial.println("Cloud polling enabled. IR transmission is not proof of physical AC state.");
}
void handleCommand(const String& command) {
  if (command.length()) noteActivity();
  if (command == "status") {
    printStatus();
  } else if (command == "dht") {
    printDht();
  } else if (command == "on") {
    sendAuxState(true);
  } else if (command == "off") {
    sendAuxState(false);
  } else if (command == "testir") {
    testIrLed();
  } else if (command == "capture") {
    captureNext();
  } else if (command == "replay") {
    replayCaptured();
  } else if (command.length() > 0) {
    Serial.printf("Unknown command. Use: %s\n", kCommands);
  }
}

void setup() {
  Serial.begin(115200);
  dht.begin();
  irReceiver.enableIRIn();
  irSender.begin();
  settings.begin("aircon", false);
  scheduleHeld = settings.getBool("scheduleHold", false);
  JsonDocument cached;
  if (!deserializeJson(cached, settings.getString("schedules", "[]"))) {
    loadSchedules(cached.as<JsonArrayConst>());
  }
  WiFi.mode(WIFI_STA);
  WiFi.setSleep(false);  // Enable modem sleep only after extended inactivity.
  WiFi.begin(WIFI_SSID, WIFI_PASSWORD);
  configTime(8 * 3600, 0, "pool.ntp.org", "time.google.com");

  Serial.printf("Stage 1 ready. Use: %s\n", kCommands);
  printStatus();
}

void checkSerial() {
  static String command;
  static bool overflow = false;
  // Bound each pass so continuous serial traffic cannot starve cloud polling.
  for (uint8_t count = 0; count < 32 && Serial.available(); ++count) {
    const char character = Serial.read();
    if (character == '\n' || character == '\r') {
      if (!overflow) {
        command.trim();
        command.toLowerCase();
        handleCommand(command);
      } else {
        Serial.printf("Command too long; discarded. Use: %s\n", kCommands);
      }
      command = "";
      overflow = false;
    } else if (command.length() < 32 && !overflow) {
      command += character;
    } else {
      overflow = true;
    }
  }
}

void loop() {
  if (capturePending && uint32_t(millis() - captureStartedMs) >= 60000) {
    capturePending = false;
    Serial.println("Capture timed out. DHT reads resumed; use capture to try again.");
  }
  if (irReceiver.decode(&irResults)) {
    if (irResults.overflow) {
      Serial.println("IR capture overflow: incomplete data; do not use for replay.");
    } else if (capturePending && !irResults.repeat && irResults.rawlen > 1) {
      capturedRawLength = getCorrectedRawLength(&irResults);
      capturedRaw = resultToRawArray(&irResults);
      if (capturedRaw != nullptr && capturedRawLength > 0) {
        capturePending = false;
        Serial.println("Raw capture saved in RAM. Aim transmitter at AC, then type replay. Lost at reboot.");
      } else {
        delete[] capturedRaw;
        capturedRaw = nullptr;
        capturedRawLength = 0;
        Serial.println("Raw capture allocation failed; try again.");
      }
    }
    Serial.println("IR capture received:");
    Serial.println(resultToHumanReadableBasic(&irResults));
    Serial.println(resultToSourceCode(&irResults));
    irReceiver.resume();
  }

  checkSerial();

  if (!capturePending && millis() - lastDhtReadMs >= kDhtIntervalMs) {
    lastDhtReadMs = millis();
    printDht();
  }

  if (WiFi.status() != WL_CONNECTED && millis() - lastReconnectMs >= kReconnectIntervalMs) {
    lastReconnectMs = millis();
    WiFi.reconnect();
  }
  if (!capturePending && WiFi.status() == WL_CONNECTED &&
      millis() - lastPollMs >= kPollIntervalMs) {
    lastPollMs = millis();
    pollCloud();
  }
  if (!capturePending && (!INUVAIR_DEEP_SLEEP || cloudSynced || millis() >= 30000)) runDailySchedule();
  if (!capturePending) updateIdlePowerSaving();
  if (!capturePending && millis() >= 2000) sleepWhenReady();

  delay(5);
}
