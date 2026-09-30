#!/bin/bash
# Launch a script with the WebKitGTK (Safari engine) environment.
# Usage: bash scripts/run_webkit.sh <script.py> [extra args]
# Requires: Xvfb :95 running (started automatically if absent).
set -euo pipefail

pgrep -f "Xvfb :95" > /dev/null 2>/dev/null || (Xvfb :95 -screen 0 1920x1080x24 > /dev/null 2>&1 &)
sleep 1

export LD_LIBRARY_PATH="/tmp/wklibs/root/usr/lib/x86_64-linux-gnu${LD_LIBRARY_PATH:+:$LD_LIBRARY_PATH}"
# glvnd on Debian reads the double-underscore internal env var to find ICD jsons
export __EGL_VENDOR_LIBRARY_DIRS="/tmp/wklibs/root/usr/share/glvnd/egl_vendor.d"
export EGL_VENDOR_LIBRARY_DIRS="/tmp/wklibs/root/usr/share/glvnd/egl_vendor.d"
export DISPLAY=:95
export LIBGL_ALWAYS_SOFTWARE=1
export GALLIUM_DRIVER=llvmpipe
export PLAYWRIGHT_SKIP_VALIDATE_HOST_REQUIREMENTS=1
# Avoid stray dbus/session-bus warnings from GTK
export GIO_USE_VFS=local
export NO_AT_BRIDGE=1
# glib-networking TLS backend (user-space extracted) — needed for HTTPS in WebKit
export GIO_EXTRA_MODULES="/tmp/wklibs/root/usr/lib/x86_64-linux-gnu/gio/modules"
# gsettings schemas (compiled) — WebKit/glib proxy settings need them
export GSETTINGS_SCHEMA_DIR="/tmp/wklibs/root/usr/share/glib-2.0/schemas"
export XDG_DATA_DIRS="/tmp/wklibs/root/usr/share:${XDG_DATA_DIRS:-/usr/local/share:/usr/share}"
# GStreamer plugins (user-space) — WebKitGTK media player needs them or the
# WebProcess crashes on any page containing a <video> element
export GST_PLUGIN_PATH_1_0="/tmp/wklibs/root/usr/lib/x86_64-linux-gnu/gstreamer-1.0"
export GST_PLUGIN_SYSTEM_PATH_1_0="/tmp/wklibs/root/usr/lib/x86_64-linux-gnu/gstreamer-1.0"
# null audio sink — no pulseaudio/alsa in this container
export GST_REGISTRY_FORK="no"

exec python3 "$@"
