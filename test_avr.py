import urllib.request, json, subprocess

# Let us run the resolution using cargo test or directly via vessel-core
# Or test what ANDROID_VR gets from Innertube:
import urllib.request

body = json.dumps({
    "context": {
        "client": {
            "clientName": "ANDROID_VR",
            "clientVersion": "1.61.48",
            "deviceMake": "Oculus",
            "deviceModel": "Quest 3",
            "osName": "Android",
            "osVersion": "12",
            "androidSdkVersion": 32,
            "hl": "en",
            "gl": "US"
        },
        "user": {"lockedSafetyMode": False}
    },
    "videoId": "kJQP7kiw5Fk",
    "contentCheckOk": True,
    "racyCheckOk": True
}).encode()

req = urllib.request.Request(
    "https://www.youtube.com/youtubei/v1/player?prettyPrint=false",
    data=body,
    headers={
        "Content-Type": "application/json",
        "User-Agent": "com.google.android.apps.youtube.vr.oculus/1.61.48 (Linux; U; Android 12; Quest 3) gzip"
    }
)

try:
    resp = json.loads(urllib.request.urlopen(req).read().decode())
    print("STATUS:", resp.get("playabilityStatus", {}).get("status"))
    formats = resp.get("streamingData", {}).get("adaptiveFormats", [])
    print("FORMATS:", len(formats))
    for f in formats:
        if "audio/mp4" in f.get("mimeType", ""):
            url = f.get("url")
            print("AUDIO URL:", url[:80] if url else "NO DIRECT URL (signatureCipher)")
            if url:
                cmd = ["curl", "-s", "-D", "-", "--max-time", "5", url, "-H", "User-Agent: com.google.android.apps.youtube.vr.oculus/1.61.48 (Linux; U; Android 12; Quest 3) gzip", "-H", "Range: bytes=0-1000", "-o", "/dev/null"]
                res = subprocess.run(cmd, capture_output=True, text=True)
                print("CURL RESULT:\n", res.stdout)
            break
except Exception as e:
    print("ERR:", e)