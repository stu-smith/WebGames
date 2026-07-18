#!/usr/bin/env python3
"""Simple local static file server for WebGames.

Serves the current directory over HTTP so the site runs without the
cross-origin restrictions you hit when opening files via file://.

Usage:
    python server.py            # serve on http://localhost:8000
    python server.py 5500       # serve on a custom port
"""

import http.server
import socketserver
import sys
import webbrowser

PORT = int(sys.argv[1]) if len(sys.argv) > 1 else 8000


class Handler(http.server.SimpleHTTPRequestHandler):
    def end_headers(self):
        # Permissive CORS + no caching so edits show up on reload.
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Cache-Control", "no-store, no-cache, must-revalidate")
        super().end_headers()

    def log_message(self, fmt, *args):
        sys.stdout.write("  %s\n" % (fmt % args))


class Server(socketserver.ThreadingTCPServer):
    allow_reuse_address = True


if __name__ == "__main__":
    url = f"http://localhost:{PORT}/"
    with Server(("", PORT), Handler) as httpd:
        print(f"Serving WebGames at {url}")
        print("Press Ctrl+C to stop.")
        try:
            webbrowser.open(url)
            httpd.serve_forever()
        except KeyboardInterrupt:
            print("\nStopped.")
