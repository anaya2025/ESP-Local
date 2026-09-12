/**
 * @file airplay_raop.cpp
 * @brief Lightweight AirPlay 1 (RAOP) Receiver implementation for ESP32-S3
 */

#include "airplay_raop.h"

AirPlayReceiver::AirPlayReceiver()
    : _rtspPort(5000), _rtpPort(6000), _rtspServer(5000), _clientConnected(false),
      _lastKeepAlive(0), _onAudioPcm(nullptr), _onMeta(nullptr),
      _onVolume(nullptr), _onState(nullptr) {
}

bool AirPlayReceiver::begin(const char* deviceName, uint16_t rtspPort, uint16_t rtpPort) {
    _deviceName = deviceName;
    _rtspPort = rtspPort;
    _rtpPort = rtpPort;

    _rtspServer.begin(_rtspPort);
    _rtpUdp.begin(_rtpPort);           // Port 6000: RTP Audio (PCM samples)
    _rtpControlUdp.begin(_rtpPort + 1); // Port 6001: RTP Control
    _rtpTimingUdp.begin(_rtpPort + 2);  // Port 6002: RTP Timing

    _announceBonjour();
    Serial.printf("[AirPlay] RAOP Receiver listening on RTSP port %d, RTP audio ports %d-%d\n", _rtspPort, _rtpPort, _rtpPort + 2);
    return true;
}

void AirPlayReceiver::_announceBonjour() {
    uint8_t mac[6];
    WiFi.macAddress(mac);
    char macStr[18];
    snprintf(macStr, sizeof(macStr), "%02X%02X%02X%02X%02X%02X", mac[0], mac[1], mac[2], mac[3], mac[4], mac[5]);
    char macColonStr[18];
    snprintf(macColonStr, sizeof(macColonStr), "%02X:%02X:%02X:%02X:%02X:%02X", mac[0], mac[1], mac[2], mac[3], mac[4], mac[5]);

    // Service name standard for AirPlay audio: MAC@DeviceName
    String raopServiceName = String(macStr) + "@" + _deviceName;

    // Helper lambda using explicit String types to avoid overload ambiguity in ESPmDNS.h
    auto addTxt = [](const String& svc, const String& proto, const String& key, const String& val) {
        MDNS.addServiceTxt(svc, proto, key, val);
    };

    // Announce _raop._tcp on port 5000: Unencrypted 16-bit 44.1kHz Stereo PCM
    // Setting et=0, ek=0, cn=0 instructs iOS / macOS to stream raw unencrypted linear PCM without RSA/AES keys!
    MDNS.addService("raop", "tcp", _rtspPort);
    addTxt("raop", "tcp", "tp", "UDP");
    addTxt("raop", "tcp", "sm", "false");
    addTxt("raop", "tcp", "sv", "false");
    addTxt("raop", "tcp", "ek", "0");       // 0 = No encryption key needed
    addTxt("raop", "tcp", "et", "0");       // 0 = Unencrypted stream (standard RAOP)
    addTxt("raop", "tcp", "cn", "0");       // 0 = Linear 16-bit PCM (no ALAC compression)
    addTxt("raop", "tcp", "ch", "2");       // 2 = Stereo channels
    addTxt("raop", "tcp", "ss", "16");      // 16 = 16-bit sample size
    addTxt("raop", "tcp", "sr", "44100");   // 44.1 kHz sample rate
    addTxt("raop", "tcp", "vn", "65537");
    addTxt("raop", "tcp", "txtvers", "1");
    addTxt("raop", "tcp", "da", "true");
    addTxt("raop", "tcp", "md", "0,1,2");
    addTxt("raop", "tcp", "pw", "false");

    // Announce _airplay._tcp on port 5000: Standard AppleTV/Airport audio target (features 0x7 for audio playback)
    // Avoids 0x5A7FFFF7 which forces AirPlay 2 HomeKit Pair-Verify (Curve25519/SRP6a)
    MDNS.addService("airplay", "tcp", _rtspPort);
    addTxt("airplay", "tcp", "model", "AppleTV2,1");
    addTxt("airplay", "tcp", "srcvers", "220.68");
    addTxt("airplay", "tcp", "features", "0x7");
    addTxt("airplay", "tcp", "flags", "0x4");
    addTxt("airplay", "tcp", "deviceid", String(macColonStr));
    addTxt("airplay", "tcp", "acl", "0");
    addTxt("airplay", "tcp", "pw", "false");

    Serial.printf("[AirPlay] AirPlay Bonjour announced: %s (%s)\n", raopServiceName.c_str(), macColonStr);
}

void AirPlayReceiver::loop() {
    _handleRtspRequests();
    _handleRtpAudio();

    // Drain control and timing sockets to keep network buffers clean
    if (_rtpControlUdp.parsePacket() > 0) {
        _rtpControlUdp.flush();
    }
    if (_rtpTimingUdp.parsePacket() > 0) {
        _rtpTimingUdp.flush();
    }

    if (_clientConnected && (!_rtspClient || !_rtspClient.connected())) {
        stop();
    }
}

void AirPlayReceiver::_handleRtspRequests() {
    if (!_rtspClient || !_rtspClient.connected()) {
        _rtspClient = _rtspServer.available();
        if (_rtspClient) {
            _clientConnected = true;
            _rtspClient.setTimeout(20);
            _clientName = _rtspClient.remoteIP().toString();
            Serial.printf("[AirPlay] iOS / macOS client connected from %s\n", _clientName.c_str());
            if (_onState) _onState(true);
        }
    }

    if (_rtspClient && _rtspClient.available()) {
        String reqLine = _rtspClient.readStringUntil('\n');
        reqLine.trim();

        if (reqLine.length() > 0) {
            String cseq = "1";
            int contentLength = 0;
            while (_rtspClient.available()) {
                String header = _rtspClient.readStringUntil('\n');
                header.trim();
                if (header.startsWith("CSeq:")) {
                    cseq = header.substring(5);
                    cseq.trim();
                } else if (header.startsWith("Content-Length:")) {
                    contentLength = header.substring(15).toInt();
                }
                if (header.length() == 0) break; // End of RTSP headers
            }

            // Read payload body if Content-Length specified
            String body = "";
            if (contentLength > 0 && contentLength < 4096) {
                while (contentLength > 0 && _rtspClient.available()) {
                    char c = (char)_rtspClient.read();
                    body += c;
                    contentLength--;
                }
            }

            if (reqLine.startsWith("OPTIONS")) {
                _sendRtspResponse(cseq, "Public: ANNOUNCE, SETUP, RECORD, PAUSE, FLUSH, TEARDOWN, OPTIONS, SET_PARAMETER, GET_PARAMETER\r\n");
            } else if (reqLine.startsWith("ANNOUNCE")) {
                _sendRtspResponse(cseq);
                if (_onMeta) _onMeta("AirPlay Audio", _clientName);
            } else if (reqLine.startsWith("SETUP")) {
                String transport = "Transport: RTP/AVP/UDP;unicast;mode=record;server_port=" + String(_rtpPort) + ";control_port=" + String(_rtpPort + 1) + ";timing_port=" + String(_rtpPort + 2) + "\r\nSession: 12345678\r\nAudio-Jack-Status: connected; type=digital\r\n";
                _sendRtspResponse(cseq, transport);
            } else if (reqLine.startsWith("RECORD")) {
                _sendRtspResponse(cseq, "Session: 12345678\r\nAudio-Latency: 11025\r\n");
                if (_onState) _onState(true);
            } else if (reqLine.startsWith("SET_PARAMETER")) {
                // Parse volume parameter from body: "volume: -15.000000"
                int vIdx = body.indexOf("volume:");
                if (vIdx >= 0) {
                    float volDb = body.substring(vIdx + 7).toFloat();
                    // -30dB (0%) to 0dB (100%), -144dB is mute
                    float volPercent = 0.0f;
                    if (volDb > -100.0f) {
                        volPercent = (volDb + 30.0f) / 30.0f * 100.0f;
                        if (volPercent < 0.0f) volPercent = 0.0f;
                        if (volPercent > 100.0f) volPercent = 100.0f;
                    }
                    if (_onVolume) _onVolume(volPercent);
                    Serial.printf("[AirPlay] Volume adjusted by client: %.1f dB -> %.0f%%\n", volDb, volPercent);
                }
                _sendRtspResponse(cseq);
            } else if (reqLine.startsWith("FLUSH") || reqLine.startsWith("PAUSE")) {
                _sendRtspResponse(cseq, "RTP-Info: seq=0;rtptime=0\r\n");
                if (_onState) _onState(false);
            } else if (reqLine.startsWith("TEARDOWN")) {
                _sendRtspResponse(cseq, "Connection: close\r\n");
                stop();
            } else {
                _sendRtspResponse(cseq);
            }
        }
    }
}

void AirPlayReceiver::_handleRtpAudio() {
    int packetSize = _rtpUdp.parsePacket();
    while (packetSize > 0) {
        if (packetSize > 12) { // Standard RTP header is 12 bytes
            uint8_t buffer[1472];
            int len = _rtpUdp.read(buffer, sizeof(buffer));
            if (len > 12 && _onAudioPcm) {
                // In uncompressed PCM RAOP (cn=0), bytes 12..end are raw 16-bit 44.1kHz stereo PCM
                _onAudioPcm(&buffer[12], len - 12);
            }
        } else {
            _rtpUdp.flush();
        }
        packetSize = _rtpUdp.parsePacket();
    }
}

void AirPlayReceiver::_sendRtspResponse(const String& cseq, const String& extraHeaders) {
    String resp = "RTSP/1.0 200 OK\r\n"
                  "CSeq: " + cseq + "\r\n"
                  "Server: AirTunes/220.68\r\n";
    if (extraHeaders.length() > 0) {
        resp += extraHeaders;
    }
    resp += "\r\n";
    _rtspClient.print(resp);
}

void AirPlayReceiver::stop() {
    if (_clientConnected) {
        _clientConnected = false;
        if (_onState) _onState(false);
        Serial.println("[AirPlay] Client disconnected");
    }
    if (_rtspClient) {
        _rtspClient.stop();
    }
}
