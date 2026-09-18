#!/bin/bash
export CARGO_HOME=/opt/vessel/cargo
export RUSTUP_HOME=/opt/vessel/rustup
export PATH=/opt/vessel/cargo/bin:/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin
cd /opt/vessel/src
cargo test --lib -- test_live_resolve_and_fetch -- --ignored --nocapture