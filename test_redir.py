import urllib.request, json, subprocess, re

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

resp = json.loads(urllib.request.urlopen(req).read().decode())
gv_url = resp["source"]["url"]
redir_url = re.sub(r'https://[^/]+/', 'https://redirector.googlevideo.com/', gv_url)
print("Redirector URL:", redir_url[:80])
ua = resp["source"]["headers"].get("User-Agent", "")

cmd = ["curl", "-v", "-L", "--max-time", "10", redir_url, "-H", f"User-Agent: {ua}", "-H", "Range: bytes=0-1000", "-o", "/dev/null"]
res = subprocess.run(cmd, capture_output=True, text=True)
print("CURL STDERR:\n", res.stderr)