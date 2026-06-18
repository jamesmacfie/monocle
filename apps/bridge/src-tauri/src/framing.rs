//! Native-messaging stdio framing: a u32 length prefix in the machine's NATIVE
//! byte order, followed by exactly that many UTF-8 JSON bytes. The same framing
//! is used on the relay⇄daemon UDS link, so this codec is shared.

use tokio::io::{AsyncRead, AsyncReadExt, AsyncWrite, AsyncWriteExt};

/// host→browser native-messaging cap (Chrome). Also a sane guard on reads.
pub const MAX_FRAME: usize = 1024 * 1024;

/// Encode a JSON payload as one frame: native-endian u32 length + body.
pub fn encode_frame(payload: &[u8]) -> Vec<u8> {
    let mut out = Vec::with_capacity(4 + payload.len());
    out.extend_from_slice(&(payload.len() as u32).to_ne_bytes());
    out.extend_from_slice(payload);
    out
}

/// Read exactly one frame. Returns `Ok(None)` on a clean EOF before any bytes
/// (the peer closed the pipe — for the relay this means the browser/daemon went
/// away and we should exit).
pub async fn read_frame<R: AsyncRead + Unpin>(r: &mut R) -> std::io::Result<Option<Vec<u8>>> {
    let mut len_buf = [0u8; 4];
    match r.read_exact(&mut len_buf).await {
        Ok(_) => {}
        Err(e) if e.kind() == std::io::ErrorKind::UnexpectedEof => return Ok(None),
        Err(e) => return Err(e),
    }
    let len = u32::from_ne_bytes(len_buf) as usize;
    if len > MAX_FRAME {
        return Err(std::io::Error::new(
            std::io::ErrorKind::InvalidData,
            "frame exceeds 1MB cap",
        ));
    }
    let mut body = vec![0u8; len];
    r.read_exact(&mut body).await?;
    Ok(Some(body))
}

/// Write one frame and flush.
pub async fn write_frame<W: AsyncWrite + Unpin>(w: &mut W, payload: &[u8]) -> std::io::Result<()> {
    w.write_all(&encode_frame(payload)).await?;
    w.flush().await
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn encode_has_native_len_prefix() {
        let body = br#"{"id":"x"}"#;
        let f = encode_frame(body);
        assert_eq!(&f[0..4], &(body.len() as u32).to_ne_bytes());
        assert_eq!(&f[4..], body);
    }

    #[tokio::test]
    async fn round_trip_then_eof() {
        let body = br#"{"v":1,"id":"abc","method":"status"}"#;
        let framed = encode_frame(body);
        let mut cur: &[u8] = &framed;
        let got = read_frame(&mut cur).await.unwrap().unwrap();
        assert_eq!(got, body);
        // nothing left → clean EOF
        assert!(read_frame(&mut cur).await.unwrap().is_none());
    }
}
