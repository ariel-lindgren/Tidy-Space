use std::path::Path;

/// Uma regra de exclusão, classificada a partir do texto digitado pelo usuário:
/// - contém separador de caminho → prefixo de caminho (`C:\Jogos`, `/mnt/backup`)
/// - começa com `*.` → extensão (`*.tmp`)
/// - qualquer outro texto → nome exato de arquivo ou pasta (`node_modules`)
#[derive(Debug, Clone, PartialEq, Eq)]
enum Rule {
    Path(String),
    Extension(String),
    Name(String),
}

#[derive(Debug, Clone, Default)]
pub struct Excludes {
    rules: Vec<Rule>,
    case_insensitive: bool,
}

impl Excludes {
    /// Windows e macOS usam sistemas de arquivos que, por padrão, não diferenciam maiúsculas.
    pub fn parse(patterns: &[String]) -> Self {
        Self::parse_with_case(patterns, cfg!(any(windows, target_os = "macos")))
    }

    pub fn parse_with_case(patterns: &[String], case_insensitive: bool) -> Self {
        let fold = |s: &str| {
            if case_insensitive {
                s.to_lowercase()
            } else {
                s.to_string()
            }
        };
        let rules = patterns
            .iter()
            .map(|p| p.trim())
            .filter(|p| !p.is_empty())
            .map(|p| {
                if p.contains('/') || p.contains('\\') {
                    Rule::Path(fold(&normalize(p)))
                } else if let Some(ext) = p.strip_prefix("*.") {
                    Rule::Extension(fold(&format!(".{ext}")))
                } else {
                    Rule::Name(fold(p))
                }
            })
            .collect();
        Self {
            rules,
            case_insensitive,
        }
    }

    pub fn is_empty(&self) -> bool {
        self.rules.is_empty()
    }

    pub fn matches(&self, path: &Path, name: &str) -> bool {
        if self.rules.is_empty() {
            return false;
        }
        let fold = |s: &str| {
            if self.case_insensitive {
                s.to_lowercase()
            } else {
                s.to_string()
            }
        };
        let name = fold(name);
        let mut full: Option<String> = None;
        self.rules.iter().any(|rule| match rule {
            Rule::Name(n) => *n == name,
            Rule::Extension(e) => name.ends_with(e.as_str()),
            Rule::Path(p) => {
                let full = full.get_or_insert_with(|| fold(&normalize(&path.to_string_lossy())));
                full == p || (full.starts_with(p.as_str()) && full.as_bytes().get(p.len()) == Some(&b'/'))
            }
        })
    }
}

/// Barras normais e sem barra final, para comparar caminhos de qualquer plataforma.
fn normalize(p: &str) -> String {
    let s = p.replace('\\', "/");
    let trimmed = s.trim_end_matches('/');
    if trimmed.is_empty() {
        "/".to_string()
    } else {
        trimmed.to_string()
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn ex(patterns: &[&str], ci: bool) -> Excludes {
        Excludes::parse_with_case(&patterns.iter().map(|s| s.to_string()).collect::<Vec<_>>(), ci)
    }

    #[test]
    fn matches_by_name() {
        let e = ex(&["node_modules"], false);
        assert!(e.matches(Path::new("/a/node_modules"), "node_modules"));
        assert!(!e.matches(Path::new("/a/node_modules2"), "node_modules2"));
    }

    #[test]
    fn matches_by_extension_case_insensitive() {
        let e = ex(&["*.tmp"], true);
        assert!(e.matches(Path::new("/a/x.TMP"), "x.TMP"));
        assert!(!e.matches(Path::new("/a/tmp"), "tmp"));
    }

    #[test]
    fn matches_path_prefix_on_component_boundary() {
        let e = ex(&["C:\\Jogos\\"], true);
        assert!(e.matches(Path::new("c:/jogos"), "jogos"));
        assert!(e.matches(Path::new("C:\\Jogos\\Steam"), "Steam"));
        assert!(!e.matches(Path::new("C:\\Jogos2"), "Jogos2"));
    }

    #[test]
    fn ignores_blank_patterns() {
        assert!(ex(&["", "   "], false).is_empty());
    }
}
