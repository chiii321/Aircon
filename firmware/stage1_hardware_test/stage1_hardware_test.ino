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
const char kCommands[] = "status, dht, on, off, testir, capture, replay";
bool capturePending = false;
uint32_t captureStartedMs = 0;
uint16_t* capturedRaw = nullptr;
uint16_t capturedRawLength = 0;

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
void checkButton(Button& button, const char* message, bool turnOn);

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
    Serial.println("DHT22 read failed. Check wiring and any required DATA pull-up resistor.");
    return;
  }

  Serial.printf("DHT22: %.1f C, %.1f %% RH\n", temperatureC, humidity);
}

void sendAuxState(bool turnOn) {
  if (capturePending) {
    Serial.println("Capture is armed; wait for the remote or the 60-second timeout before sending.");
    return;
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

void checkButton(Button& button, const char* message, bool turnOn) {
  const bool reading = digitalRead(button.pin);

  if (reading != button.lastReading) {
    button.lastChangedMs = millis();
  }

  if (millis() - button.lastChangedMs >= kButtonDebounceMs &&
      reading != button.stableState) {
    button.stableState = reading;

    if (button.stableState == LOW) {
      Serial.println(message);
      sendAuxState(turnOn);
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
  Serial.println("AUX ON: COOLIX 0xB21F48 | OFF: captured raw frame (AC response not yet verified)");
  Serial.println("ON/OFF labels follow the original remote buttons pressed during capture.");
  Serial.printf("IR TX inverted: %s | raw replay carrier: %u kHz | captured timings: %u\n",
                IR_SEND_INVERTED ? "yes" : "no", kRawReplayKhz, capturedRawLength);
  Serial.printf("Build: %s %s\n", __DATE__, __TIME__);
  Serial.println("Standalone Stage 1 hardware test; no network services.");
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
  pinMode(ON_BUTTON_PIN, INPUT_PULLUP);
  pinMode(OFF_BUTTON_PIN, INPUT_PULLUP);
  // A held button at boot must be released before it can send a command.
  onButton.lastReading = onButton.stableState = digitalRead(ON_BUTTON_PIN);
  offButton.lastReading = offButton.stableState = digitalRead(OFF_BUTTON_PIN);
  onButton.lastChangedMs = offButton.lastChangedMs = millis();

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

  checkButton(onButton, "Physical ON button pressed.", true);
  checkButton(offButton, "Physical OFF button pressed.", false);

  if (!capturePending && millis() - lastDhtReadMs >= kDhtIntervalMs) {
    lastDhtReadMs = millis();
    printDht();
  }

  delay(5);
}