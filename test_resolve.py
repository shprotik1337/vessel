import urllib.request, json

data = json.dumps({
    "track": {
        "id": "kJQP7kiw5Fk",
        "title": "Despacito",
        "artists": ["Luis Fonsi"],
        "duration_ms": 229000,
        "provider": "you_tube_music",
        "web_url": "https://music.youtube.com/watch?v=kJQP7kiw5Fk",
        "capability": {"kind": "full"}
    }
}).encode()

req = urllib.request.Request(
    "http://127.0.0.1:7700/api/v1/providers/youtube_music/playback/resolve?token=vessel-95-k7f2d9",
    data=data,
    headers={"Content-Type": "application/json"}
)

try:
    resp = urllib.request.urlopen(req)
    print("SUCCESS:", resp.read().decode())
except Exception as e:
    if hasattr(e, "read"):
        print("ERROR:", e.read().decode())
    else:
        print("ERROR:", e)