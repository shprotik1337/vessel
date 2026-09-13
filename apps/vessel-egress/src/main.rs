use std::io::{Read, Write};
use std::net::{TcpListener, TcpStream};
use std::sync::atomic::{AtomicUsize, Ordering};
use std::thread;

static CONN_COUNT: AtomicUsize = AtomicUsize::new(0);

fn main() {
    let listen = std::env::args()
        .nth(1)
        .unwrap_or_else(|| "127.0.0.1:7701".to_string());
    let Ok(listener) = TcpListener::bind(&listen) else {
        eprintln!("vessel-egress: не удалось занять {listen}");
        return;
    };
    eprintln!("vessel-egress: SOCKS5 на {listen} (исходит из домашней сети)");
    for stream in listener.incoming() {
        let Ok(stream) = stream else { continue };
        thread::spawn(move || handle(stream));
    }
}

fn handle(mut client: TcpStream) {
    // greeting: VER, NMETHODS, METHODS
    let mut hdr = [0u8; 2];
    if client.read_exact(&mut hdr).is_err() || hdr[0] != 5 {
        return;
    }
    let mut methods = vec![0u8; hdr[1] as usize];
    if client.read_exact(&mut methods).is_err() {
        return;
    }
    if methods.iter().all(|m| *m != 0) {
        let _ = client.write_all(&[5, 0xFF]);
        return;
    }
    if client.write_all(&[5, 0]).is_err() {
        return;
    }
    // request: VER, CMD=CONNECT, RSV, ATYP
    let mut req = [0u8; 4];
    if client.read_exact(&mut req).is_err() || req[0] != 5 || req[1] != 1 {
        return;
    }
    let target = match read_target(&mut client, req[3]) {
        Some(t) => t,
        None => {
            let _ = reject(&mut client);
            return;
        }
    };
    let Ok(remote) = connect_any(&target) else {
        let _ = reject(&mut client);
        return;
    };
    // success reply: VER, REP, RSV, ATYP=IPV4, BND.ADDR(4), BND.PORT(2)
    if client.write_all(&[5, 0, 0, 1, 0, 0, 0, 0, 0, 0]).is_err() {
        return;
    }
    let n = CONN_COUNT.fetch_add(1, Ordering::Relaxed) + 1;
    eprintln!("vessel-egress: #{n} {target}");
    pump(client, remote);
}

fn read_target(client: &mut TcpStream, atyp: u8) -> Option<String> {
    match atyp {
        1 => {
            let mut b = [0u8; 4];
            client.read_exact(&mut b).ok()?;
            let mut p = [0u8; 2];
            client.read_exact(&mut p).ok()?;
            Some(format!("{}.{}.{}.{}:{}", b[0], b[1], b[2], b[3], port(&p)))
        }
        3 => {
            let mut l = [0u8; 1];
            client.read_exact(&mut l).ok()?;
            let mut host = vec![0u8; l[0] as usize];
            client.read_exact(&mut host).ok()?;
            let mut p = [0u8; 2];
            client.read_exact(&mut p).ok()?;
            Some(format!("{}:{}", String::from_utf8(host).ok()?, port(&p)))
        }
        4 => {
            let mut b = [0u8; 16];
            client.read_exact(&mut b).ok()?;
            let mut p = [0u8; 2];
            client.read_exact(&mut p).ok()?;
            let mut groups = Vec::with_capacity(8);
            for g in b.chunks_exact(2) {
                groups.push(format!("{:x}", u16::from_be_bytes([g[0], g[1]])));
            }
            Some(format!("[{}]:{}", groups.join(":"), port(&p)))
        }
        _ => None,
    }
}

fn port(bytes: &[u8; 2]) -> u16 {
    u16::from_be_bytes(*bytes)
}

fn connect_any(target: &str) -> std::io::Result<TcpStream> {
    TcpStream::connect(target)
}

fn reject(client: &mut TcpStream) -> std::io::Result<()> {
    client.write_all(&[5, 9, 0, 1, 0, 0, 0, 0, 0, 0])
}

fn pump(client: TcpStream, server: TcpStream) {
    let (mut cr, mut cw) = match (client.try_clone(), client) {
        (Ok(r), w) => (r, w),
        (Err(_), _) => return,
    };
    let (mut sr, mut sw) = match (server.try_clone(), server) {
        (Ok(r), w) => (r, w),
        (Err(_), _) => return,
    };
    let t1 = thread::spawn(move || {
        let mut buf = [0u8; 64 * 1024];
        loop {
            match cr.read(&mut buf) {
                Ok(0) | Err(_) => break,
                Ok(n) => {
                    if sw.write_all(&buf[..n]).is_err() {
                        break;
                    }
                }
            }
        }
        let _ = sw.flush();
    });
    let mut buf = [0u8; 64 * 1024];
    loop {
        match sr.read(&mut buf) {
            Ok(0) | Err(_) => break,
            Ok(n) => {
                if cw.write_all(&buf[..n]).is_err() {
                    break;
                }
            }
        }
    }
    let _ = cw.flush();
    let _ = t1.join();
}
