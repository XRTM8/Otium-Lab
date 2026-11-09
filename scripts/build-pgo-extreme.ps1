# ==============================================================================
# Otium Sovereign Studio - Profile-Guided Optimization (PGO) Extreme Build Script
# ==============================================================================
# This script compiles the Rust studio with CPU-tailored hardware instructions,
# collects execution profiles from real workloads, and recompiles with LLVM PGO
# for maximum branch prediction accuracy, zero-cost inlining, and peak FPS.
# ==============================================================================

param (
    [switch]$SkipTraining = $false,
    [string]$Package = "otium-app"
)

$ErrorActionPreference = "Stop"
$WorkspaceRoot = Resolve-Path "$PSScriptRoot\.."
Set-Location $WorkspaceRoot

$PgoDir = "$WorkspaceRoot\target\pgo-data"
if (Test-Path $PgoDir) {
    Write-Host "[1/5] Cleaning previous PGO profile data..." -ForegroundColor Cyan
    Remove-Item -Recurse -Force $PgoDir
}
New-Item -ItemType Directory -Force -Path $PgoDir | Out-Null

Write-Host "[2/5] Instrumenting binary with LLVM profile counters..." -ForegroundColor Cyan
$env:RUSTFLAGS = "-Cprofile-generate=$PgoDir -Ctarget-cpu=native"
cargo build --release -p $Package

if (-not $SkipTraining) {
    Write-Host "[3/5] Running training workloads (Rendering, Splines, Scanner, Vault)..." -ForegroundColor Cyan
    # Run workspace test suite to generate realistic execution traces
    cargo test --workspace -- --nocapture
}

Write-Host "[4/5] Merging instrumentation profile data..." -ForegroundColor Cyan
$llvmProfdata = Get-Command "llvm-profdata" -ErrorAction SilentlyContinue
if (-not $llvmProfdata) {
    # Check inside Rust toolchain libexec
    $rustupHome = if ($env:RUSTUP_HOME) { $env:RUSTUP_HOME } else { "$env:USERPROFILE\.rustup" }
    $candidate = Get-ChildItem -Path "$rustupHome\toolchains" -Filter "llvm-profdata.exe" -Recurse -Depth 4 -ErrorAction SilentlyContinue | Select-Object -First 1
    if ($candidate) {
        $llvmProfdata = $candidate.FullName
    }
}

if ($llvmProfdata) {
    & $llvmProfdata merge -o "$PgoDir\merged.profdata" (Get-ChildItem -Path $PgoDir -Filter "*.profraw" | ForEach-Object { $_.FullName })
    Write-Host "Merged profdata created successfully at $PgoDir\merged.profdata" -ForegroundColor Green

    Write-Host "[5/5] Recompiling final extreme-performance release binary with PGO..." -ForegroundColor Cyan
    $env:RUSTFLAGS = "-Cprofile-use=$PgoDir\merged.profdata -Ctarget-cpu=native"
    cargo build --release -p $Package
    Write-Host "[SUCCESS] Extreme PGO Build complete: target\release\$Package.exe" -ForegroundColor Green
} else {
    Write-Host "[INFO] llvm-profdata not found in PATH; falling back to direct native-cpu release build." -ForegroundColor Yellow
    $env:RUSTFLAGS = "-Ctarget-cpu=native"
    cargo build --release -p $Package
    Write-Host "[SUCCESS] Native CPU Release Build complete: target\release\$Package.exe" -ForegroundColor Green
}
