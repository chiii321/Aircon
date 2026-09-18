/*
  Stage 1 hardware test for ESP32-WROOM-32.
  Uses confirmed AUX ELECTRA_AC state captures for ON and OFF.
*/

#include <Arduino.h>
#include <DHT.h>
#include <IRremoteESP8266.h>
#include <IRrecv.h>
#include <IRsend.h>
#include <IRutils.h>
#include <ir_Electra.h>

#define DHT_PIN 32
#define DHT_TYPE DHT22
#define IR_RECEIVE_PIN 27
#define IR_SEND_PIN 25
#define ON_BUTTON_PIN 33
#define OFF_BUTTON_PIN 26

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
constexpr unsigned long kButtonDebounceMs = 50;

DHT dht(DHT_PIN, DHT_TYPE);
IRrecv irReceiver(IR_RECEIVE_PIN, kCaptureBufferSize, kCaptureTimeoutMs, true);
IRsend irSender(IR_SEND_PIN);
decode_results irResults;
unsigned long lastDhtReadMs = 0;
constexpr unsigned long kDhtIntervalMs = 2000;

struct Button {
  uint8_t pin;
  bool lastReading;
  bool stableState;
  unsigned long lastChangedMs;
};

Button onButton = {ON_BUTTON_PIN, HIGH, HIGH, 0};
Button offButton = {OFF_BUTTON_PIN, HIGH, HIGH, 0};

// Confirmed AUX remote states decoded as ELECTRA_AC. Replay is not yet verified.
const uint8_t kAuxOnState[] = {
    0xC3, 0x88, 0xE0, 0x00, 0x40, 0x00, 0x20,
    0x00, 0x00, 0x00, 0x00, 0x05, 0x90,
};

const uint8_t kAuxOffState[] = {
    0xC3, 0x88, 0xE0, 0x00, 0x40, 0x00, 0x20,
    0x00, 0x00, 0x20, 0x00, 0x05, 0xB0,
};

static_assert(sizeof(kAuxOnState) == kElectraAcStateLength,
              "AUX ON state must be an ELECTRA_AC state frame.");
static_assert(sizeof(kAuxOffState) == kElectraAcStateLength,
              "AUX OFF state must be an ELECTRA_AC state frame.");

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

void sendAuxState(const uint8_t state[], const char* command) {
  irReceiver.disableIRIn();
  irSender.sendElectraAC(state, kElectraAcStateLength);
  delay(100);
  irReceiver.enableIRIn();
  Serial.printf("Sent AUX %s ELECTRA_AC state. Replay is not yet verified.\n", command);
}

void checkButton(Button& button, const char* message, const uint8_t state[],
                 const char* command) {
  const bool reading = digitalRead(button.pin);

  if (reading != button.lastReading) {
    button.lastChangedMs = millis();
  }

  if (millis() - button.lastChangedMs >= kButtonDebounceMs &&
      reading != button.stableState) {
    button.stableState = reading;

    if (button.stableState == LOW) {
      Serial.println(message);
      sendAuxState(state, command);
    }
  }

  button.lastReading = reading;
}

void printStatus() {
  Serial.println("Stage 1 hardware test");
  Serial.printf("DHT22 GPIO: %d | IR receiver GPIO: %d | IR transmitter GPIO: %d\n",
                DHT_PIN, IR_RECEIVE_PIN, IR_SEND_PIN);
  Serial.println("AUX ON/OFF captures: configured (replay not yet verified)");
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
    sendAuxState(kAuxOnState, "ON");
  } else if (command == "off") {
    sendAuxState(kAuxOffState, "OFF");
  } else if (command.length() > 0) {
    Serial.println("Unknown command. Use: status, dht, time, on, off");
  }
}

void setup() {
  Serial.begin(115200);
  dht.begin();
  irReceiver.enableIRIn();
  irSender.begin();
  pinMode(ON_BUTTON_PIN, INPUT_PULLUP);
  pinMode(OFF_BUTTON_PIN, INPUT_PULLUP);

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

  checkButton(onButton, "Physical ON button pressed.", kAuxOnState, "ON");
  checkButton(offButton, "Physical OFF button pressed.", kAuxOffState, "OFF");

  if (millis() - lastDhtReadMs >= kDhtIntervalMs) {
    lastDhtReadMs = millis();
    printDht();
  }

  delay(5);
}
