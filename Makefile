.PHONY: help build build-mac build-mac-arm build-mac-x64 build-win build-linux test run dev typecheck clean

help:
	@echo "Available targets:\n\n  build           - Build the application for the current platform.\n  build-mac       - Build a macOS universal binary (x86_64 + aarch64).\n  build-mac-arm   - Build a macOS arm64 binary.\n  build-mac-x64   - Build a macOS x86_64 binary.\n  build-win       - Build a Windows x64 binary.\n  build-linux     - Build a Debian x64 binary.\n  test            - Run frontend and Tauri test suites.\n  run             - Run the Tauri development server.\n  dev             - Run the Vite frontend dev server only.\n  typecheck       - Type‑check the frontend.\n  clean           - Clean build artifacts.\n  help            - Show this help message.\n\nUse 'make <target>' to run a specific target."

NPM := npm

# Default build target for the current host platform.
build:
	npx tauri build

# macOS universal build (x86_64 + aarch64).
# Must be run on macOS with both targets installed.
build-mac:
	npx tauri build --target universal-apple-darwin

build-mac-arm:
	npx tauri build --target aarch64-apple-darwin

# Windows x64 build.
# Must be run on Windows with the MSVC toolchain.
build-win:
	npx tauri build --target x86_64-pc-windows-msvc

# Debian x64 build.
# Must be run on Linux with the Debian tooling available.
build-linux:
	npx tauri build --target x86_64-unknown-linux-gnu

# Run frontend and Tauri test suites.
test:
	$(NPM) test
	cd src-tauri && cargo test

# Run the Tauri development server.
run:
	npx tauri dev

# Type-check the frontend.
typecheck:
	npx tsc --noEmit

# Clean build artifacts.
clean:
	rm -rf dist
	cd src-tauri && cargo clean
