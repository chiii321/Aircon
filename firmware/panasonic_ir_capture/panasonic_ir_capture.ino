// Standalone receiver-only capture tool for the ESP32-WROOM-32.
// Install IRremoteESP8266. Serial Monitor: 115200 baud, Newline.
#include <Arduino.h>
#include <IRremoteESP8266.h>
#include <IRrecv.h>
#include <IRac.h>
#include <IRutils.h>

constexpr uint16_t kReceivePin = 27;
constexpr uint16_t kBufferSize = 2048;
constexpr uint8_t kCaptureTimeoutMs = 50;
IRrecv receiver(kReceivePin, kBufferSize, kCaptureTimeoutMs, true);
decode_results results;
String captureLabel = "unlabelled";
String serialLine;
uint32_t captureNumber = 0;
bool lineTooLong = false;

void setup() {
  Serial.begin(115200);
  serialLine.reserve(120);
  receiver.setUnknownThreshold(12);
  receiver.enableIRIn();
  Serial.println("\nPanasonic IR capture ready. Receiver OUT -> GPIO27.");
  Serial.println("Type a label and press Enter before pressing the remote button.");
  Serial.println("Example: COOL_24C_FAN_AUTO_POWERFUL_OFF_DOWN_FROM_25C");
  Serial.println("Every received frame is printed. Copy the entire capture block.");
}

void loop() {
  while (Serial.available()) {
    char c = Serial.read();
    if (c == '\r') continue;
    if (c == '\n') {
      if (lineTooLong) Serial.println("Label too long; previous label retained.");
      else if (serialLine.length()) {
        captureLabel = serialLine;
        Serial.println("Capture label: " + captureLabel);
      }
      serialLine = "";
      lineTooLong = false;
    } else if (serialLine.length() < 120) {
      serialLine += c;
    } else {
      lineTooLong = true;
    }
  }

  if (receiver.decode(&results)) {
    Serial.printf("\n=== CAPTURE %lu BEGIN ===\n", static_cast<unsigned long>(++captureNumber));
    Serial.println("Label: " + captureLabel);
    Serial.printf("Uptime ms: %lu\n", static_cast<unsigned long>(millis()));
    Serial.println("Library: " _IRREMOTEESP8266_VERSION_STR);
    if (results.overflow) {
      Serial.println("INVALID: buffer overflow. Do not use this capture.");
    } else {
      Serial.print(resultToHumanReadableBasic(&results));
      String description = IRAcUtils::resultAcToString(&results);
      if (description.length()) Serial.println("Decoded AC settings: " + description);
      else Serial.println("No decoded AC settings; retain raw timings.");
      Serial.println(resultToSourceCode(&results));
      Serial.println("Carrier frequency is not measured by this receiver.");
    }
    Serial.printf("=== CAPTURE %lu END ===\n", static_cast<unsigned long>(captureNumber));
    receiver.resume();
  }
  delay(1);
}
