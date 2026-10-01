//! Caminhos para as APIs Win32 "W".
//!
//! Sem o prefixo `\\?\`, `CreateFileW` e afins recusam caminhos acima de `MAX_PATH` (260) com
//! "caminho não encontrado" — comum em `node_modules` do pnpm. A std do Rust já faz essa conversão
//! internamente; aqui fazemos o mesmo para as chamadas diretas ao Win32.

use std::os::windows::ffi::OsStrExt;
use std::path::Path;

const BACKSLASH: u16 = b'\\' as u16;
const SLASH: u16 = b'/' as u16;
const COLON: u16 = b':' as u16;
const QUESTION: u16 = b'?' as u16;
const DOT: u16 = b'.' as u16;

/// UTF-16 terminado em zero, com `\\?\` (ou `\\?\UNC\`) quando o caminho é absoluto.
/// Caminhos relativos, já prefixados ou com componentes `.`/`..` seguem como estão.
pub(crate) fn wide(path: &Path) -> Vec<u16> {
    let raw: Vec<u16> = path
        .as_os_str()
        .encode_wide()
        .map(|c| if c == SLASH { BACKSLASH } else { c })
        .collect();
    let mut out = Vec::with_capacity(raw.len() + 9);
    let already = raw.len() >= 4 && raw[0] == BACKSLASH && raw[1] == BACKSLASH && (raw[2] == QUESTION || raw[2] == DOT);
    let drive = raw.len() >= 3 && raw[1] == COLON && raw[2] == BACKSLASH;
    let unc = !already && raw.len() > 2 && raw[0] == BACKSLASH && raw[1] == BACKSLASH;
    if !already && !has_dot_components(&raw) {
        if drive {
            out.extend("\\\\?\\".encode_utf16());
        } else if unc {
            out.extend("\\\\?\\UNC".encode_utf16());
            out.extend_from_slice(&raw[1..]);
            out.push(0);
            return out;
        }
    }
    out.extend_from_slice(&raw);
    out.push(0);
    out
}

/// Caminho no formato do NT (`\??\C:\...`), sem terminador, para as APIs `Nt*`.
/// `None` quando o caminho não é absoluto.
pub(crate) fn nt(path: &Path) -> Option<Vec<u16>> {
    let mut w = wide(path);
    w.pop();
    let verbatim = w.len() > 4 && w[..4] == [BACKSLASH, BACKSLASH, QUESTION, BACKSLASH];
    verbatim.then(|| {
        w[1] = QUESTION;
        w
    })
}

fn has_dot_components(raw: &[u16]) -> bool {
    raw.split(|&c| c == BACKSLASH)
        .any(|part| part == [DOT] || part == [DOT, DOT])
}

#[cfg(test)]
mod tests {
    use super::*;

    fn s(path: &str) -> String {
        let w = wide(Path::new(path));
        String::from_utf16(&w[..w.len() - 1]).unwrap()
    }

    #[test]
    fn prefixes_absolute_paths() {
        assert_eq!(s(r"C:\a\b"), r"\\?\C:\a\b");
        assert_eq!(s("C:/a/b"), r"\\?\C:\a\b");
        assert_eq!(s(r"\\srv\share\x"), r"\\?\UNC\srv\share\x");
    }

    #[test]
    fn nt_paths() {
        let n = |p: &str| nt(Path::new(p)).map(|w| String::from_utf16(&w).unwrap());
        assert_eq!(n(r"C:\a").as_deref(), Some(r"\??\C:\a"));
        assert_eq!(n(r"\\srv\s\x").as_deref(), Some(r"\??\UNC\srv\s\x"));
        assert_eq!(n(r"a\b"), None);
    }

    #[test]
    fn keeps_what_cannot_be_verbatim() {
        assert_eq!(s(r"\\?\C:\a"), r"\\?\C:\a");
        assert_eq!(s(r"a\b"), r"a\b");
        assert_eq!(s(r"C:\a\..\b"), r"C:\a\..\b");
    }
}
