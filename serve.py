import os, http.server, socketserver
os.chdir('/Users/harmony/Documents/Travel/釜山福岡-2026')
with socketserver.TCPServer(('', 8765), http.server.SimpleHTTPRequestHandler) as s:
    s.serve_forever()
