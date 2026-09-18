"""Run actual sketch logic with mocked hardware: python tests/test_stage1.py [C++ compiler]."""
from pathlib import Path
import re
import shutil
import subprocess
import sys
import tempfile

root = Path(__file__).resolve().parents[1]
sketch = (root / "firmware/stage1_hardware_test/stage1_hardware_test.ino").read_text()
# The real Arduino build checks library integration; this checks control flow.
sketch = re.sub(r'^#include .*$', '', sketch, flags=re.M)
mock = r'''
#include <cassert>
#include <cmath>
#include <cstdint>
#include <cstdio>
#include <cctype>
#include <string>
#include <vector>
#include <map>
#include <ctime>
using std::isnan;
constexpr bool HIGH = true, LOW = false;
constexpr int INPUT_PULLUP = 2, DHT22 = 22;
constexpr uint16_t kElectraAcStateLength = 13;
uint32_t clockMs = 0;
bool pins[40];
uint32_t millis() { return clockMs; }
void delay(unsigned long ms) { clockMs += ms; }
bool digitalRead(uint8_t pin) { return pins[pin]; }
void pinMode(uint8_t, int mode) { assert(mode == INPUT_PULLUP); }
struct String : std::string {
  using std::string::string;
  using std::string::operator=;
  void trim() {
    while (!empty() && std::isspace(static_cast<unsigned char>(back()))) pop_back();
    while (!empty() && std::isspace(static_cast<unsigned char>(front()))) erase(0, 1);
  }
  void toLowerCase() { for (char& c : *this) c = std::tolower(static_cast<unsigned char>(c)); }
};
struct SerialMock {
  std::string input, output;
  void begin(int baud) { assert(baud == 115200); }
  bool available() { return !input.empty(); }
  char read() { char c = input.front(); input.erase(0, 1); return c; }
  void println(const std::string& s) { output += s + "\n"; }
  void print(const std::string& s) { output += s; }
  template<typename... T> void printf(const char* format, T... args) {
    char text[512]; std::snprintf(text, sizeof(text), format, args...); output += text;
  }
} Serial;
struct DHT {
  int reads = 0;
  float humidity = 50, temperature = 25;
  DHT(int, int) {}
  void begin() {}
  float readHumidity() { ++reads; return humidity; }
  float readTemperature() { return temperature; }
};
struct decode_results { bool overflow = false, repeat = false; uint16_t rawlen = 4; };
bool allocationFails = false;
uint16_t getCorrectedRawLength(decode_results*) { return 3; }
uint16_t* resultToRawArray(decode_results*) {
  return allocationFails ? nullptr : new uint16_t[3]{9000, 4500, 600};
}
struct IRrecv {
  bool enabled = false, pending = false;
  int resumes = 0;
  IRrecv(int, int, int, bool) {}
  void enableIRIn() { enabled = true; }
  void disableIRIn() { enabled = false; }
  bool decode(decode_results*) { return enabled && pending; }
  void resume() { ++resumes; pending = false; }
};
std::string resultToHumanReadableBasic(decode_results*) { return "decoded"; }
std::string resultToSourceCode(decode_results*) { return "source"; }
struct IRsend {
  std::vector<std::vector<uint8_t>> sent;
  std::vector<std::vector<uint16_t>> rawSent;
  IRsend(int, bool) {}
  void begin() {}
  void sendRaw(const uint16_t* data, uint16_t length, uint16_t khz) {
    assert(khz == 38); rawSent.emplace_back(data, data + length);
  }
  void sendElectraAC(const uint8_t* data, uint16_t length) {
    sent.emplace_back(data, data + length);
  }
};
struct IRElectraAc {
  static bool validChecksum(const uint8_t* data, uint16_t length) {
    uint8_t sum = 0;
    for (uint16_t i = 0; i + 1 < length; ++i) sum += data[i];
    return sum == data[length - 1];
  }
};
constexpr int WIFI_STA = 1, WL_CONNECTED = 3, HTTP_GET = 0, HTTP_POST = 1;
struct WifiMock {
  int connection = 0;
  void mode(int) {}
  void setAutoReconnect(bool) {}
  void begin(const char*, const char*) {}
  int status() { return connection; }
  std::string localIP() { return "192.0.2.1"; }
} WiFi;
struct WebServer {
  std::map<std::string, void(*)()> routes;
  int polls = 0;
  bool started = false;
  WebServer(int) {}
  void on(const char* path, int, void(*handler)()) { routes[path] = handler; }
  void begin() { started = true; }
  void handleClient() { ++polls; }
  void send(int, const char* = "", const char* = "") {}
  void sendHeader(const char*, const char*) {}
};
void configTime(int, int, const char*, const char*) {}
bool getLocalTime(tm*, uint32_t timeout) { assert(timeout == 0); return false; }
#define WIFI_SSID "test"
#define WIFI_PASSWORD "test-only"
'''
checks = r'''
void sample(Button& b, bool level, uint32_t elapsed) {
  clockMs += elapsed; pins[b.pin] = level;
  checkButton(b, "press", b.pin == ON_BUTTON_PIN ? kAuxOnState : kAuxOffState, "test");
}
void serial(const std::string& line) {
  Serial.input += line;
  while (Serial.available()) checkSerial();
}
int main() {
  // ELECTRA_AC byte 9 bit 5 is power; catches the original swapped routing.
  assert((kAuxOnState[9] & 0x20) != 0);
  assert((kAuxOffState[9] & 0x20) == 0);
  for (bool& pin : pins) pin = HIGH;
  pins[ON_BUTTON_PIN] = LOW;
  setup();
  assert(clockMs == 0); // no startup wait for Wi-Fi
  sample(onButton, LOW, 100); // held at boot: no send
  assert(irSender.sent.empty());
  sample(onButton, HIGH, 0); sample(onButton, HIGH, 50);
  for (Button* b : {&onButton, &offButton}) {
    const auto before = irSender.sent.size();
    sample(*b, LOW, 0); sample(*b, HIGH, 10); sample(*b, LOW, 10);
    sample(*b, LOW, 49); assert(irSender.sent.size() == before);
    sample(*b, LOW, 1); assert(irSender.sent.size() == before + 1);
    sample(*b, LOW, 5000); assert(irSender.sent.size() == before + 1);
    sample(*b, HIGH, 0); sample(*b, LOW, 10); // release bounce cannot re-arm
    sample(*b, LOW, 50); assert(irSender.sent.size() == before + 1);
    sample(*b, HIGH, 0); sample(*b, HIGH, 50);
    sample(*b, LOW, 0); sample(*b, LOW, 50);
    assert(irSender.sent.size() == before + 2);
    sample(*b, HIGH, 0); sample(*b, HIGH, 50);
  }
  clockMs = UINT32_MAX - 20;
  sample(onButton, LOW, 0); const auto beforeWrap = irSender.sent.size();
  sample(onButton, LOW, 49); assert(irSender.sent.size() == beforeWrap);
  sample(onButton, LOW, 1); assert(irSender.sent.size() == beforeWrap + 1);
  auto before = irSender.sent.size();
  serial(" ON \r\noff\non\roff\r\n");
  assert(irSender.sent.size() == before + 4);
  assert(irSender.sent.back() == std::vector<uint8_t>(kAuxOffState, kAuxOffState + 13));
  before = irSender.sent.size(); serial("o");
  sample(offButton, LOW, 0); sample(offButton, LOW, 50);
  assert(irSender.sent.size() == before + 1); // incomplete input doesn't block buttons
  serial("n\n"); assert(irSender.sent.size() == before + 2);
  before = irSender.sent.size(); serial(std::string(33, 'x') + "on\noff\n");
  assert(irSender.sent.size() == before + 1);
  uint8_t invalid[13] = {}; invalid[12] = 1;
  sendAuxState(invalid, "invalid"); assert(irSender.sent.size() == before + 1);
  assert(irReceiver.enabled);
  irReceiver.pending = true; irResults.overflow = true;
  clockMs += 2000; const int reads = dht.reads; loop();
  assert(irReceiver.resumes == 1 && dht.reads > reads);
  assert(Serial.output.find("IR capture overflow") != std::string::npos);
  dht.humidity = NAN; serial("dht\nstatus\ntime\nunknown\n");
  assert(Serial.output.find("DHT22 read failed") != std::string::npos);
  serial("replay\n"); assert(irSender.rawSent.empty());
  serial("capture\n"); const int pausedReads = dht.reads;
  serial("dht\non\n"); assert(dht.reads == pausedReads);
  irReceiver.pending = true; loop(); // overflow cannot replace capture
  assert(capturePending && capturedRaw == nullptr);
  irResults.overflow = false; irResults.repeat = true;
  irReceiver.pending = true; loop(); assert(capturedRaw == nullptr);
  irResults.repeat = false; allocationFails = true;
  irReceiver.pending = true; loop(); assert(capturePending && capturedRaw == nullptr);
  allocationFails = false; irReceiver.pending = true; loop();
  assert(!capturePending && capturedRawLength == 3);
  serial("replay\n"); assert(irSender.rawSent.size() == 1);
  assert(irSender.rawSent.back() == std::vector<uint16_t>({9000, 4500, 600}));
  assert(irReceiver.enabled);
  serial("capture\nreplay\n"); assert(irSender.rawSent.size() == 1); // no stale replay
  clockMs += 60000; loop(); assert(!capturePending && capturedRaw == nullptr);
#if ENABLE_WIFI
  assert(server.started && server.routes.size() == 3);
  WiFi.connection = WL_CONNECTED; loop(); assert(server.polls == 1);
  server.routes["/on"](); assert((irSender.sent.back()[9] & 0x20) != 0);
  server.routes["/off"](); assert((irSender.sent.back()[9] & 0x20) == 0);
  WiFi.connection = 0; loop(); assert(!wifiWasConnected);
  WiFi.connection = WL_CONNECTED; loop(); assert(wifiWasConnected);
#endif
  std::puts("PASS: mapping, buttons, Serial, capture/replay, timeout, RX/DHT and Wi-Fi flow");
}
'''
compiler = sys.argv[1] if len(sys.argv) > 1 else shutil.which("clang++") or shutil.which("g++")
if not compiler:
    sys.exit("Pass a host C++ compiler path: python tests/test_stage1.py <clang++ or g++>")
with tempfile.TemporaryDirectory(prefix="aircon-test-") as temp:
    source = Path(temp) / "stage1.cpp"
    binary = Path(temp) / "stage1.exe"
    source.write_text(mock + sketch + checks)
    for wifi in (0, 1):
        subprocess.run([compiler, "-std=c++17", f"-DENABLE_WIFI={wifi}", str(source), "-o", str(binary)], check=True)
        subprocess.run([str(binary)], check=True)
