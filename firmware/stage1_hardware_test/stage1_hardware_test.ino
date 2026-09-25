/*
  Stage 1 hardware test for ESP32-WROOM-32.
  AUX COOLIX control and raw replay diagnostics. Physical replay unverified.
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
constexpr uint8_t kMaxSchedules = 12;

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
struct DailyWindow { uint16_t onMinute; uint16_t offMinute; };
DailyWindow schedules[kMaxSchedules];
uint8_t scheduleCount = 0;

// Latest button-labeled captures from the original remote (2026-09-23).
constexpr uint32_t kAuxOnCode = 0xB21F48;
const uint16_t kAuxOffRaw[] = {
    4578, 4192, 662, 1484, 756, 318, 754, 1392, 754, 1392, 726, 346, 754, 318,
    758, 1388, 754, 318, 758, 314, 760, 1386, 726, 346, 730, 342, 760, 1384,
    756, 1390, 754, 318, 732, 1414, 756, 316, 756, 1390, 760, 1386, 758, 1386,
    756, 1390, 730, 342, 756, 1390, 760, 1386, 762, 1382, 764, 310, 762, 310,
    758, 314, 764, 310, 766, 1380, 764, 310, 766, 306, 760, 1386, 766, 1380,
    764, 1382, 760, 312, 762, 310, 768, 304, 764, 308, 770, 302, 768, 304,
    770, 302, 764, 308, 774, 1372, 736, 1410, 768, 1376, 772, 1374, 774, 1372,
    778, 4956, 4630, 4140, 554, 1590, 774, 298, 752, 1394, 768, 1378, 776, 296,
    784, 288, 786, 1360, 778, 294, 778, 294, 786, 1362, 792, 280, 786, 288,
    788, 1358, 780, 1366, 788, 284, 782, 1362, 790, 282, 782, 1362, 786, 1360,
    788, 1358, 790, 1356, 792, 280, 784, 1362, 794, 1352, 788, 1358, 786, 286,
    790, 282, 820, 252, 790, 282, 820, 1326, 790, 282, 792, 280, 820, 1326,
    790, 1356, 786, 1360, 786, 286, 782, 290, 792, 280, 792, 282, 822, 250,
    794, 278, 822, 250, 820, 252, 822, 1324, 810, 1336, 808, 1338, 800, 1346,
    758, 1386, 708,
};
static_assert(sizeof(kAuxOffRaw) / sizeof(kAuxOffRaw[0]) == 199,
              "AUX OFF capture must contain all 199 recorded timings.");

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
  if (capturePending) {
    Serial.println("Capture is armed; wait for the remote or the 60-second timeout before sending.");
    return false;
  }
  irReceiver.disableIRIn();
  if (turnOn) {
    irSender.sendCOOLIX(kAuxOnCode);
  } else {
    irSender.sendRaw(kAuxOffRaw, sizeof(kAuxOffRaw) / sizeof(kAuxOffRaw[0]), kRawReplayKhz);
  }
  delay(100);
  irReceiver.enableIRIn();
  if (turnOn) {
    Serial.printf("Sent AUX ON COOLIX code 0x%06lX. AC response is not yet verified.\n",
                  static_cast<unsigned long>(kAuxOnCode));
  } else {
    Serial.printf("Sent captured AUX OFF raw frame (%u timings at %u kHz). AC response is not yet verified.\n",
                  static_cast<unsigned int>(sizeof(kAuxOffRaw) / sizeof(kAuxOffRaw[0])),
                  kRawReplayKhz);
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
    schedules[scheduleCount++] = {uint16_t(on), uint16_t(off)};
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
  JsonArrayConst incoming = data["schedules"].as<JsonArrayConst>();
  if (!incoming.isNull()) {
    String scheduleJson;
    serializeJson(incoming, scheduleJson);
    if (scheduleJson != settings.getString("schedules", "[]")) settings.putString("schedules", scheduleJson);
    loadSchedules(incoming);
  }
  JsonObjectConst command = data["command"].as<JsonObjectConst>();
  if (!command.isNull()) {
    const uint32_t id = command["id"].as<uint32_t>();
    const String action = command["action"].as<String>();
    if (id && (action == "on" || action == "off")) {
      if (settings.getUInt("lastCommand", 0) == id) {
        acknowledgeCommand(id, true);
      } else {
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
  struct tm localTime;
  localtime_r(&now, &localTime);
  const int minute = localTime.tm_hour * 60 + localTime.tm_min;
  if (minute == lastScheduleMinute) return;
  lastScheduleMinute = minute;
  const uint32_t eventKey = uint32_t(localTime.tm_year + 1900) * 1000000UL
      + uint32_t(localTime.tm_yday + 1) * 1440UL + minute;
  if (settings.getUInt("lastEvent", 0) == eventKey) return;
  for (uint8_t i = 0; i < scheduleCount; ++i) {
    if (schedules[i].onMinute == minute || schedules[i].offMinute == minute) {
      const bool turnOn = schedules[i].onMinute == minute;
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

void printStatus() {
  Serial.println("Stage 1 hardware test");
  Serial.printf("Device ID: %s\n", kDeviceId);
  Serial.printf("DHT22 GPIO: %d | IR receiver GPIO: %d | IR transmitter GPIO: %d\n",
                DHT_PIN, IR_RECEIVE_PIN, IR_SEND_PIN);
  Serial.printf("Wi-Fi: %s | cached schedule windows: %u\n",
                WiFi.status() == WL_CONNECTED ? "connected" : "offline", scheduleCount);
  Serial.println("AUX ON: COOLIX 0xB21F48 | OFF: captured raw frame (AC response not yet verified)");
  Serial.println("ON/OFF labels follow the original remote buttons pressed during capture.");
  Serial.printf("IR TX inverted: %s | raw replay carrier: %u kHz | captured timings: %u\n",
                IR_SEND_INVERTED ? "yes" : "no", kRawReplayKhz, capturedRawLength);
  Serial.printf("Build: %s %s\n", __DATE__, __TIME__);
  Serial.println("Cloud polling enabled. IR transmission is not proof of physical AC state.");
}

void handleCommand(const String& command) {
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
  JsonDocument cached;
  if (!deserializeJson(cached, settings.getString("schedules", "[]"))) {
    loadSchedules(cached.as<JsonArrayConst>());
  }
  WiFi.mode(WIFI_STA);
  WiFi.begin(WIFI_SSID, WIFI_PASSWORD);
  configTime(8 * 3600, 0, "pool.ntp.org", "time.google.com");

  Serial.printf("Stage 1 ready. Use: %s\n", kCommands);
  printStatus();
}

void checkSerial() {
  static String command;
  static bool overflow = false;
  // Bound each pass so continuous serial traffic cannot starve button polling.
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
  if (!capturePending) runDailySchedule();

  delay(5);
}
