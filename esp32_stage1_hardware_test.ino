#include <WiFi.h>
#include <time.h>
#include <DHT.h>
#include <IRremoteESP8266.h>
#include <IRrecv.h>
#include <IRsend.h>
#include <IRutils.h>

const char* WIFI_SSID = "";
const char* WIFI_PASSWORD = "";

static const uint16_t IR_TX_PIN = 25;
static const uint16_t IR_RX_PIN = 27;
static const uint8_t DHT_PIN = 32;

#define DHT_TYPE DHT22

static const uint16_t CAPTURE_BUFFER_SIZE = 1024;
static const uint8_t CAPTURE_TIMEOUT_MS = 50;
static const uint16_t IR_FREQUENCY_KHZ = 38;

DHT dht(DHT_PIN, DHT_TYPE);
IRsend irsend(IR_TX_PIN);
IRrecv irrecv(IR_RX_PIN, CAPTURE_BUFFER_SIZE, CAPTURE_TIMEOUT_MS, true);
decode_results irResults;

const bool HAS_AUX_ON_CAPTURE = false;
const bool HAS_AUX_OFF_CAPTURE = false;

const uint16_t AUX_ON_RAW[] = {1000};
const uint16_t AUX_OFF_RAW[] = {1000};

const uint16_t AUX_ON_RAW_LEN = sizeof(AUX_ON_RAW) / sizeof(AUX_ON_RAW[0]);
const uint16_t AUX_OFF_RAW_LEN = sizeof(AUX_OFF_RAW) / sizeof(AUX_OFF_RAW[0]);

unsigned long lastDhtReadMs = 0;
const unsigned long DHT_INTERVAL_MS = 2000;

void connectWiFi() {
  if (strlen(WIFI_SSID) == 0) {
    Serial.println("[WiFi] SSID is blank. Skipping Wi-Fi.");
    return;
  }

  WiFi.mode(WIFI_STA);
  WiFi.begin(WIFI_SSID, WIFI_PASSWORD);

  Serial.print("[WiFi] Connecting");
  unsigned long startMs = millis();

  while (WiFi.status() != WL_CONNECTED && millis() - startMs < 15000) {
    delay(500);
    Serial.print(".");
  }

  Serial.println();

  if (WiFi.status() == WL_CONNECTED) {
    Serial.println("[WiFi] Connected.");
    Serial.print("[WiFi] IP: ");
    Serial.println(WiFi.localIP());

    // Philippines = UTC+8, no DST.
    configTime(8 * 3600, 0, "pool.ntp.org", "time.nist.gov");
  } else {
    Serial.println("[WiFi] Connection timed out.");
  }
}

void printCurrentTime() {
  struct tm timeInfo;

  if (!getLocalTime(&timeInfo, 1000)) {
    Serial.println("[TIME] Not synchronized.");
    return;
  }

  char buffer[32];
  strftime(buffer, sizeof(buffer), "%Y-%m-%d %H:%M:%S", &timeInfo);

  Serial.print("[TIME] ");
  Serial.println(buffer);
}

void readDht22() {
  float humidity = dht.readHumidity();
  float temperatureC = dht.readTemperature();

  if (isnan(humidity) || isnan(temperatureC)) {
    Serial.println("[DHT22] Read failed.");
    return;
  }

  Serial.print("[DHT22] Temperature: ");
  Serial.print(temperatureC, 1);
  Serial.print(" C | Humidity: ");
  Serial.print(humidity, 1);
  Serial.println(" %");
}

void checkIrReceiver() {
  if (!irrecv.decode(&irResults)) {
    return;
  }

  Serial.println();
  Serial.println("==================================================");
  Serial.println("[IR RX] Signal captured");
  Serial.println("==================================================");

  Serial.println(resultToHumanReadableBasic(&irResults));

  Serial.println("[IR RX] Source-code representation:");
  Serial.println(resultToSourceCode(&irResults));

  Serial.println("==================================================");
  Serial.println();

  irrecv.resume();
}

void sendAuxOn() {
  if (!HAS_AUX_ON_CAPTURE) {
    Serial.println("[IR TX] AUX ON capture has not been inserted yet.");
    return;
  }

  Serial.println("[IR TX] Sending AUX ON...");
  irrecv.disableIRIn();
  irsend.sendRaw(AUX_ON_RAW, AUX_ON_RAW_LEN, IR_FREQUENCY_KHZ);
  delay(100);
  irrecv.enableIRIn();
}

void sendAuxOff() {
  if (!HAS_AUX_OFF_CAPTURE) {
    Serial.println("[IR TX] AUX OFF capture has not been inserted yet.");
    return;
  }

  Serial.println("[IR TX] Sending AUX OFF...");
  irrecv.disableIRIn();
  irsend.sendRaw(AUX_OFF_RAW, AUX_OFF_RAW_LEN, IR_FREQUENCY_KHZ);
  delay(100);
  irrecv.enableIRIn();
}

void handleSerialCommand() {
  if (!Serial.available()) {
    return;
  }

  String command = Serial.readStringUntil('\n');
  command.trim();
  command.toLowerCase();

  if (command == "on") {
    sendAuxOn();
  } else if (command == "off") {
    sendAuxOff();
  } else if (command == "dht") {
    readDht22();
  } else if (command == "time") {
    printCurrentTime();
  } else if (command == "status") {
    Serial.println("----- STATUS -----");

    Serial.print("Wi-Fi: ");
    Serial.println(WiFi.status() == WL_CONNECTED ? "CONNECTED" : "NOT CONNECTED");

    readDht22();
    printCurrentTime();

    Serial.print("AUX ON capture: ");
    Serial.println(HAS_AUX_ON_CAPTURE ? "AVAILABLE" : "NOT CAPTURED");

    Serial.print("AUX OFF capture: ");
    Serial.println(HAS_AUX_OFF_CAPTURE ? "AVAILABLE" : "NOT CAPTURED");

    Serial.println("------------------");
  } else if (command.length() > 0) {
    Serial.print("[SERIAL] Unknown command: ");
    Serial.println(command);
  }
}

void setup() {
  Serial.begin(115200);
  delay(1000);

  Serial.println();
  Serial.println("ESP32 AC Control - Stage 1 Hardware Test");
  Serial.println("----------------------------------------");

  dht.begin();
  irsend.begin();
  irrecv.enableIRIn();

  connectWiFi();

  Serial.println();
  Serial.println("Commands:");
  Serial.println("  status");
  Serial.println("  dht");
  Serial.println("  time");
  Serial.println("  on");
  Serial.println("  off");
  Serial.println();

  Serial.println("Point the AUX remote at the IR receiver and press a button.");
}

void loop() {
  checkIrReceiver();
  handleSerialCommand();

  if (millis() - lastDhtReadMs >= DHT_INTERVAL_MS) {
    lastDhtReadMs = millis();
    readDht22();
  }

  delay(5);
}
