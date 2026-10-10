#!/usr/bin/env python3
"""Tiny static server for Duskhollow (correct MIME types, revalidate-friendly caching)."""
import http.server, socketserver, os, sys
os.chdir(os.path.dirname(os.path.abspath(__file__)))
PORT = int(sys.argv[1]) if len(sys.argv) > 1 else 8080
class H(http.server.SimpleHTTPRequestHandler):
    extensions_map = {**http.server.SimpleHTTPRequestHandler.extensions_map,
        '.webmanifest': 'application/manifest+json', '.js': 'text/javascript', '.png': 'image/png', '.json': 'application/json'}
    def end_headers(self):
        p = self.path.split('?')[0]
        if p.endswith(('.html', '.js', '.css', '.webmanifest', '/')):
            self.send_header('Cache-Control', 'no-cache')
        else:
            self.send_header('Cache-Control', 'public, max-age=3600')
        if p.endswith('sw.js'):
            self.send_header('Service-Worker-Allowed', '/')
        super().end_headers()
    def log_message(self, fmt, *a): pass
class S(socketserver.ThreadingMixIn, http.server.HTTPServer):
    daemon_threads = True; allow_reuse_address = True
S(('0.0.0.0', PORT), H).serve_forever()
