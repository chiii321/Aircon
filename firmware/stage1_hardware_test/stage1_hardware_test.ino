/*
  Stage 1 hardware test for ESP32-WROOM-32.
  Captures must be genuine AUX remote signals. No AUX codes are included here.
*/

#include <Arduino.h>
#include <DHT.h>
#include <IRremoteESP8266.h>
#include <IRrecv.h>
#include <IRsend.h>
#include <IRutils.h>

#define DHT_PIN 32
#define DHT_TYPE DHT22
#define IR_RECEIVE_PIN 27
#define IR_SEND_PIN 25

// Keep false until Wi-Fi credentials are supplied outside version control.
#define ENABLE_WIFI false

#if ENABLE_WIFI
#include <WiFi.h>
#include <time.h>
#include "wifi_credentials.h"

// Define WIFI_SSID and WIFI_PASSWORD in a local, ignored credentials header.
#ifndef WIFI_SSID
#error "Define WIFI_SSID before enabling Wi-Fi."
#endif
#ifndef WIFI_PASSWORD
#error "Define WIFI_PASSWORD before enabling Wi-Fi."
#endif
#endif

constexpr uint16_t kCaptureBufferSize = 1024;
constexpr uint8_t kCaptureTimeoutMs = 50;
constexpr uint16_t kIrFrequencyKhz = 38;

DHT dht(DHT_PIN, DHT_TYPE);
IRrecv irReceiver(IR_RECEIVE_PIN, kCaptureBufferSize, kCaptureTimeoutMs, true);
IRsend irSender(IR_SEND_PIN);
decode_results irResults;
unsigned long lastDhtReadMs = 0;
constexpr unsigned long kDhtIntervalMs = 2000;

// Replace nullptr and length 0 only with real, documented AUX captures.
const uint16_t* kAuxOnRaw = nullptr;
const uint16_t kAuxOnRawLength = 0;
const uint16_t* kAuxOffRaw = nullptr;
const uint16_t kAuxOffRawLength = 0;

void printDht() {
  const float humidity = dht.readHumidity();
  const float temperatureC = dht.readTemperature();

  if (isnan(humidity) || isnan(temperatureC)) {
    Serial.println("DHT22 read failed. Check wiring and any required DATA pull-up resistor.");
    return;
  }

  Serial.printf("DHT22: %.1f C, %.1f %% RH\n", temperatureC, humidity);
}

void printTime() {
#if ENABLE_WIFI
  struct tm timeInfo;
  if (getLocalTime(&timeInfo)) {
    Serial.printf("Time (UTC+8): %04d-%02d-%02d %02d:%02d:%02d\n",
                  timeInfo.tm_year + 1900, timeInfo.tm_mon + 1, timeInfo.tm_mday,
                  timeInfo.tm_hour, timeInfo.tm_min, timeInfo.tm_sec);
  } else {
    Serial.println("NTP time is not available yet.");
  }
#else
  Serial.println("Wi-Fi/NTP is disabled in this sketch.");
#endif
}

void sendCapture(const uint16_t* rawData, uint16_t length, const char* command) {
  if (rawData == nullptr || length == 0) {
    Serial.printf("No verified AUX %s capture has been added. Capture the real remote signal first.\n", command);
    return;
  }

  irReceiver.disableIRIn();
  irSender.sendRaw(rawData, length, kIrFrequencyKhz);
  delay(100);
  irReceiver.enableIRIn();
  Serial.printf("Replayed AUX %s capture. Verify the AC response physically.\n", command);
}

void printStatus() {
  Serial.println("Stage 1 hardware test");
  Serial.printf("DHT22 GPIO: %d | IR receiver GPIO: %d | IR transmitter GPIO: %d\n",
                DHT_PIN, IR_RECEIVE_PIN, IR_SEND_PIN);
  Serial.printf("AUX ON capture: %s | AUX OFF capture: %s\n",
                kAuxOnRawLength ? "configured" : "not configured",
                kAuxOffRawLength ? "configured" : "not configured");
  Serial.printf("Wi-Fi/NTP: %s\n", ENABLE_WIFI ? "enabled" : "disabled");
}

void handleCommand(const String& command) {
  if (command == "status") {
    printStatus();
  } else if (command == "dht") {
    printDht();
  } else if (command == "time") {
    printTime();
  } else if (command == "on") {
    sendCapture(kAuxOnRaw, kAuxOnRawLength, "ON");
  } else if (command == "off") {
    sendCapture(kAuxOffRaw, kAuxOffRawLength, "OFF");
  } else if (command.length() > 0) {
    Serial.println("Unknown command. Use: status, dht, time, on, off");
  }
}

void setup() {
  Serial.begin(115200);
  dht.begin();
  irReceiver.enableIRIn();
  irSender.begin();

#if ENABLE_WIFI
  WiFi.begin(WIFI_SSID, WIFI_PASSWORD);
  configTime(8 * 60 * 60, 0, "pool.ntp.org", "time.nist.gov");
#endif

  Serial.println("Stage 1 ready. Use: status, dht, time, on, off");
}

void loop() {
  if (irReceiver.decode(&irResults)) {
    Serial.println("IR capture received:");
    Serial.println(resultToHumanReadableBasic(&irResults));
    Serial.println(resultToSourceCode(&irResults));
    irReceiver.resume();
  }

  if (Serial.available()) {
    String command = Serial.readStringUntil('\n');
    command.trim();
    command.toLowerCase();
    handleCommand(command);
  }

  if (millis() - lastDhtReadMs >= kDhtIntervalMs) {
    lastDhtReadMs = millis();
    printDht();
  }

  delay(5);
}
