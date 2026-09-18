/*
  Stage 1 hardware test for ESP32-WROOM-32.
  AUX ELECTRA_AC control and raw replay diagnostics. Physical replay unverified.
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

#ifndef IR_SEND_INVERTED
#define IR_SEND_INVERTED false  // Set true only for a confirmed active-LOW driver.
#endif
constexpr uint16_t kRawReplayKhz = 38;  // Receiver cannot measure carrier frequency.
const char kCommands[] = "status, dht, time, on, off, capture, replay";
bool capturePending = false;
uint32_t captureStartedMs = 0;
uint16_t* capturedRaw = nullptr;
uint16_t capturedRawLength = 0;

// Keep false until Wi-Fi credentials are supplied outside version control.
#ifndef ENABLE_WIFI
#define ENABLE_WIFI false
#endif

#if ENABLE_WIFI
#include <WiFi.h>
#include <WebServer.h>
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
IRsend irSender(IR_SEND_PIN, IR_SEND_INVERTED);
decode_results irResults;
unsigned long lastDhtReadMs = 0;
constexpr unsigned long kDhtIntervalMs = 2000;

struct Button {
  uint8_t pin;
  bool lastReading;
  bool stableState;
  uint32_t lastChangedMs;
};

Button onButton = {ON_BUTTON_PIN, HIGH, HIGH, 0};
Button offButton = {OFF_BUTTON_PIN, HIGH, HIGH, 0};

// Avoid Arduino generating this prototype before the Button type is defined.
void checkButton(Button& button, const char* message, const uint8_t state[],
                 const char* command);

#if ENABLE_WIFI
WebServer server(80);
bool wifiWasConnected = false;

const char kControlPage[] = R"rawliteral(
<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <title>AUX AC Controller</title>
    <style>
      body { font-family: Arial, sans-serif; margin: 3rem auto; max-width: 28rem; padding: 0 1rem; text-align: center; }
      button { border: 0; border-radius: .5rem; color: white; cursor: pointer; font-size: 1.25rem; margin: .5rem; padding: 1rem 2rem; }
      .on { background: #198754; } .off { background: #dc3545; }
    </style>
  </head>
  <body>
    <h1>AUX AC Controller</h1>
    <p>Local ESP32 control</p>
    <form action="/on" method="post"><button class="on" type="submit">Turn ON</button></form>
    <form action="/off" method="post"><button class="off" type="submit">Turn OFF</button></form>
  </body>
</html>
)rawliteral";
#endif
// Original capture documents retain their historical labels. Route these existing
// frames by ELECTRA_AC power bit (byte 9 bit 5); no new IR bytes are invented.
const uint8_t kAuxOnState[] = {
    0xC3, 0x88, 0xE0, 0x00, 0x40, 0x00, 0x20,
    0x00, 0x00, 0x20, 0x00, 0x05, 0xB0,
};

const uint8_t kAuxOffState[] = {
    0xC3, 0x88, 0xE0, 0x00, 0x40, 0x00, 0x20,
    0x00, 0x00, 0x00, 0x00, 0x05, 0x90,
};

static_assert(sizeof(kAuxOnState) == kElectraAcStateLength,
              "AUX ON state must be an ELECTRA_AC state frame.");
static_assert(sizeof(kAuxOffState) == kElectraAcStateLength,
              "AUX OFF state must be an ELECTRA_AC state frame.");

void printDht() {
  if (capturePending) {
    Serial.println("DHT paused during capture to avoid interrupting IR timings.");
    return;
  }
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
  if (getLocalTime(&timeInfo, 0)) {
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
  if (capturePending) {
    Serial.println("Capture is armed; wait for the remote or the 60-second timeout before sending.");
    return;
  }
  if (!IRElectraAc::validChecksum(state, kElectraAcStateLength)) {
    Serial.println("Invalid AUX capture checksum; transmission skipped.");
    return;
  }
  irReceiver.disableIRIn();
  irSender.sendElectraAC(state, kElectraAcStateLength);
  delay(100);
  irReceiver.enableIRIn();
  Serial.printf("Sent AUX %s ELECTRA_AC state. Replay is not yet verified.\n", command);
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

#if ENABLE_WIFI
void handleWebRoot() {
  server.send(200, "text/html", kControlPage);
}

void handleWebOn() {
  Serial.println("Web ON request received.");
  sendAuxState(kAuxOnState, "ON");
  server.sendHeader("Location", "/");
  server.send(303);
}

void handleWebOff() {
  Serial.println("Web OFF request received.");
  sendAuxState(kAuxOffState, "OFF");
  server.sendHeader("Location", "/");
  server.send(303);
}

void startLocalWebServer() {
  WiFi.mode(WIFI_STA);
  WiFi.setAutoReconnect(true);
  WiFi.begin(WIFI_SSID, WIFI_PASSWORD);
  Serial.println("Connecting to Wi-Fi in background; physical/Serial controls remain available.");

  configTime(8 * 60 * 60, 0, "pool.ntp.org", "time.nist.gov");
  server.on("/", HTTP_GET, handleWebRoot);
  server.on("/on", HTTP_POST, handleWebOn);
  server.on("/off", HTTP_POST, handleWebOff);
  server.begin();
}
#endif

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
  Serial.printf("ON button GPIO: %d | OFF button GPIO: %d (active LOW, 50 ms debounce)\n",
                ON_BUTTON_PIN, OFF_BUTTON_PIN);
  Serial.println("AUX ON/OFF captures: configured (replay not yet verified)");
  Serial.println("ON/OFF mapped by ELECTRA_AC power bit; original records retained. AC response unknown.");
  Serial.printf("IR TX inverted: %s | raw replay carrier: %u kHz | captured timings: %u\n",
                IR_SEND_INVERTED ? "yes" : "no", kRawReplayKhz, capturedRawLength);
  Serial.printf("Build: %s %s\n", __DATE__, __TIME__);
#if ENABLE_WIFI
  Serial.printf("Wi-Fi: %s\n", WiFi.status() == WL_CONNECTED ? "connected" : "not connected");
#else
  Serial.println("Wi-Fi/NTP: disabled");
#endif
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
  pinMode(ON_BUTTON_PIN, INPUT_PULLUP);
  pinMode(OFF_BUTTON_PIN, INPUT_PULLUP);
  // A held button at boot must be released before it can send a command.
  onButton.lastReading = onButton.stableState = digitalRead(ON_BUTTON_PIN);
  offButton.lastReading = offButton.stableState = digitalRead(OFF_BUTTON_PIN);
  onButton.lastChangedMs = offButton.lastChangedMs = millis();

#if ENABLE_WIFI
  startLocalWebServer();
#endif

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

  checkButton(onButton, "Physical ON button pressed.", kAuxOnState, "ON");
  checkButton(offButton, "Physical OFF button pressed.", kAuxOffState, "OFF");

#if ENABLE_WIFI
  const bool connected = WiFi.status() == WL_CONNECTED;
  if (connected && !wifiWasConnected) {
    Serial.print("Local web controller: http://");
    Serial.println(WiFi.localIP());
  }
  wifiWasConnected = connected;
  if (connected) server.handleClient();
#endif

  if (!capturePending && millis() - lastDhtReadMs >= kDhtIntervalMs) {
    lastDhtReadMs = millis();
    printDht();
  }

  delay(5);
}
