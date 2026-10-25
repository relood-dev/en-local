fn main() {
    // macOS : la capture (screencapturekit) contient du Swift. Avec les seuls outils en ligne de commande
    // d'Apple (sans Xcode), ses bibliothèques sont dans le dossier « swift/macosx » de la chaîne active.
    if std::env::var("CARGO_CFG_TARGET_OS").as_deref() == Ok("macos") {
        if let Ok(o) = std::process::Command::new("xcode-select").arg("-p").output() {
            let racine = String::from_utf8_lossy(&o.stdout).trim().to_string();
            for d in [format!("{racine}/usr/lib/swift/macosx"), format!("{racine}/Toolchains/XcodeDefault.xctoolchain/usr/lib/swift/macosx")] {
                if std::path::Path::new(&d).is_dir() {
                    println!("cargo:rustc-link-search=native={d}");
                }
            }
        }
        // Bibliothèques Swift du système (macOS 12 et plus) : chargées depuis /usr/lib/swift.
        println!("cargo:rustc-link-arg=-Wl,-rpath,/usr/lib/swift");
    }
    tauri_build::build()
}
