import urllib.request, urllib.parse, json, subprocess, re

data = json.dumps({
    'track': {
        'id': 'kJQP7kiw5Fk',
        'title': 'Despacito',
        'artists': ['Luis Fonsi'],
        'duration_ms': 229000,
        'provider': 'you_tube_music',
        'web_url': 'https://music.youtube.com/watch?v=kJQP7kiw5Fk',
        'capability': {'kind': 'full'}
    }
}).encode()

req = urllib.request.Request(
    'http://127.0.0.1:7700/api/v1/providers/youtube_music/playback/resolve?token=vessel-95-k7f2d9',
    data=data,
    headers={'Content-Type': 'application/json'}
)

resp = json.loads(urllib.request.urlopen(req).read().decode())
url = resp['source']['url']
ua = resp['source']['headers'].get('User-Agent', '')

parsed = urllib.parse.urlparse(url)
print('ORIGINAL NETLOC:', parsed.netloc)

# Extract servers from mn query param WITHOUT modifying query string
q = urllib.parse.parse_qs(parsed.query)
mns = q.get('mn', [''])[0].split(',')
print('MN SERVERS:', mns)

for mn in mns:
    # Build candidate host e.g. rr1---sn-2oi5h5-5j.googlevideo.com
    prefix = parsed.netloc.split('---')[0] if '---' in parsed.netloc else 'rr1'
    cand_host = f'{prefix}---{mn}.googlevideo.com'
    # Keep query string 100% untouched!
    cand_url = urllib.parse.urlunparse((parsed.scheme, cand_host, parsed.path, parsed.params, parsed.query, parsed.fragment))
    print(f'Trying host {cand_host}...')
    cmd = ['curl', '-s', '-D', '-', '--max-time', '4', cand_url, '-H', f'User-Agent: {ua}', '-H', 'Range: bytes=0-1000', '-o', '/dev/null']
    res = subprocess.run(cmd, capture_output=True, text=True)
    status_line = res.stdout.split('\r\n')[0] if res.stdout else 'TIMEOUT / CONNECT FAIL'
    print(f'   -> {status_line}')