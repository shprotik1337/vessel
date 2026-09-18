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
print("ORIGINAL GV URL:", gv_url[:90])

# Look at mn param:
mn_match = re.search(r'[?&]mn=([^&]+)', gv_url)
if mn_match:
    servers = mn_match.group(1).split('%2C')
    if len(servers) == 1:
        servers = mn_match.group(1).split(',')
    print("SERVERS in mn:", servers)
    if len(servers) > 1:
        # replace the hostname with the second server:
        # e.g. rr1---sn-u2oxu-f5fed.googlevideo.com -> rr1---sn-u1i5h5-54.googlevideo.com
        first = servers[0]
        second = servers[1]
        replaced_url = gv_url.replace(first, second)
        print("REPLACED URL:", replaced_url[:90])
        ua = resp["source"]["headers"].get("User-Agent", "")
        cmd = ["curl", "-s", "-D", "-", "--max-time", "5", replaced_url, "-H", f"User-Agent: {ua}", "-H", "Range: bytes=0-1000", "-o", "/dev/null"]
        res = subprocess.run(cmd, capture_output=True, text=True)
        print("STATUS WITH REPLACED HOST:\n", res.stdout)