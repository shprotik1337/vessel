import urllib.request, json, subprocess

clients = [
    {"name": "WEB", "version": "2.20240909.01.00", "ua": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/133.0.0.0 Safari/537.36"},
    {"name": "WEB_REMIX", "version": "1.20240909.01.00", "ua": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/133.0.0.0 Safari/537.36"},
    {"name": "TVHTML5_SIMPLY_EMBEDDED_PLAYER", "version": "2.0", "ua": "Mozilla/5.0 (PlayStation 4 5.05) AppleWebKit/605.1.15 (KHTML, like Gecko)"},
    {"name": "ANDROID", "version": "19.09.37", "ua": "com.google.android.youtube/19.09.37 (Linux; U; Android 11) gzip"},
    {"name": "IOS", "version": "19.09.3", "ua": "com.google.ios.youtube/19.09.3 (iPhone16,2; U; CPU iOS 17_4 like Mac OS X; en_US)"},
    {"name": "VISIONOS", "version": "1.02", "ua": "Mozilla/5.0 (Macintosh; Intel Mac OS X 15_7_3) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/26.0 Safari/605.1.15"},
    {"name": "MWEB", "version": "2.20240909.01.00", "ua": "Mozilla/5.0 (Linux; Android 11) AppleWebKit/537.36 Chrome/133.0.0.0 Mobile Safari/537.36"},
]

video_id = "kJQP7kiw5Fk"

for c in clients:
    body = json.dumps({
        "context": {
            "client": {
                "clientName": c["name"],
                "clientVersion": c["version"],
                "hl": "en",
                "gl": "US"
            },
            "user": {"lockedSafetyMode": False}
        },
        "videoId": video_id,
        "contentCheckOk": True,
        "racyCheckOk": True
    }).encode()
    
    req = urllib.request.Request(
        "https://www.youtube.com/youtubei/v1/player?prettyPrint=false",
        data=body,
        headers={"Content-Type": "application/json", "User-Agent": c["ua"]}
    )
    
    try:
        resp = json.loads(urllib.request.urlopen(req).read().decode())
        status = resp.get("playabilityStatus", {}).get("status")
        formats = resp.get("streamingData", {}).get("adaptiveFormats", [])
        urls = [f.get("url") for f in formats if f.get("url")]
        ciphers = [f.get("signatureCipher") for f in formats if f.get("signatureCipher")]
        print(f"[{c['name']}] status={status} formats={len(formats)} direct_urls={len(urls)} ciphers={len(ciphers)}")
        if urls:
            u = urls[0]
            host = u.split("/")[2]
            # probe host
            cmd = ["curl", "-s", "-D", "-", "--max-time", "2", u, "-H", f"User-Agent: {c['ua']}", "-H", "Range: bytes=0-100", "-o", "/dev/null"]
            probe = subprocess.run(cmd, capture_output=True, text=True)
            alive = "200" in probe.stdout or "206" in probe.stdout
            print(f"   -> Host: {host} Alive: {alive}")
    except Exception as e:
        print(f"[{c['name']}] Error: {e}")