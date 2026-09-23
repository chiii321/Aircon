/*
  Stage 1 hardware test for ESP32-WROOM-32.
  AUX COOLIX control and raw replay diagnostics. Physical replay unverified.
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
void checkButton(Button& button, const char* message, uint32_t code,
                 const char* command);

// Confirmed twice from original remote button presses; physical ESP32 replay pending.
constexpr uint32_t kAuxOnCode = 0xB21F38;
constexpr uint32_t kAuxOffCode = 0xB27BE0;

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

void sendAuxState(uint32_t code, const char* command) {
  if (capturePending) {
    Serial.println("Capture is armed; wait for the remote or the 60-second timeout before sending.");
    return;
  }
  irReceiver.disableIRIn();
  irSender.sendCOOLIX(code);
  delay(100);
  irReceiver.enableIRIn();
  Serial.printf("Sent AUX %s COOLIX code 0x%06lX. AC response is not yet verified.\n", command, static_cast<unsigned long>(code));
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
  Serial.println("IR LED test bursts sent. A phone camera may filter 940 nm IR.");
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

void checkButton(Button& button, const char* message, uint32_t code,
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
      sendAuxState(code, command);
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
  Serial.println("AUX COOLIX ON/OFF codes: configured (AC response not yet verified)");
  Serial.println("ON/OFF labels confirmed from original remote presses.");
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
    sendAuxState(kAuxOnCode, "ON");
  } else if (command == "off") {
    sendAuxState(kAuxOffCode, "OFF");
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

  checkButton(onButton, "Physical ON button pressed.", kAuxOnCode, "ON");
  checkButton(offButton, "Physical OFF button pressed.", kAuxOffCode, "OFF");

  if (!capturePending && millis() - lastDhtReadMs >= kDhtIntervalMs) {
    lastDhtReadMs = millis();
    printDht();
  }

  delay(5);
}
