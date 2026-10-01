//! Mede uma varredura: `cargo run --release -p scanner-core --example scan -- <pasta> [off|all]`.
use std::time::Instant;

use scanner_core::{scan, HardLinks, ScanOptions, ScanProgress, FLAG_HARDLINK};

fn main() {
    let args: Vec<String> = std::env::args().skip(1).collect();
    let root = args.first().expect("informe a pasta");
    let opts = ScanOptions {
        root: root.into(),
        threads: args.get(2).and_then(|t| t.parse().ok()).unwrap_or(0),
        hard_links: match args.get(1).map(String::as_str) {
            Some("off") => HardLinks::Off,
            Some("all") => HardLinks::Everywhere,
            _ => HardLinks::default(),
        },
        ..Default::default()
    };
    let started = Instant::now();
    let s = scan(&opts, &ScanProgress::new()).expect("varredura falhou");
    let links = s.flags.iter().filter(|f| **f & FLAG_HARDLINK != 0).count();
    println!(
        "{:.2}s  entradas={}  em disco={:.1} MB  hard links={}  erros={}",
        started.elapsed().as_secs_f64(),
        s.len(),
        s.total_allocated() as f64 / 1e6,
        links,
        s.error_count
    );
}
