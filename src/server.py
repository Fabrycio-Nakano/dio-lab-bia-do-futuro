import os
import sys
import http.server
import socketserver
import webbrowser
import json

# Definir o diretório raiz do projeto (uma pasta acima da pasta 'src')
script_dir = os.path.dirname(os.path.abspath(__file__))
project_root = os.path.dirname(script_dir)
os.chdir(project_root)

# Carregar variáveis do arquivo .env manualmente
env_vars = {}
env_path = os.path.join(project_root, '.env')
if os.path.exists(env_path):
    with open(env_path, 'r', encoding='utf-8') as f:
        for line in f:
            line = line.strip()
            if line and not line.startswith('#') and '=' in line:
                key, val = line.split('=', 1)
                env_vars[key.strip()] = val.strip().strip('"').strip("'")

PORT = 8000

class MyHandler(http.server.SimpleHTTPRequestHandler):
    def do_GET(self):
        if self.path == '/config':
            self.send_response(200)
            self.send_header('Content-Type', 'application/json')
            self.end_headers()
            
            # Retorna as chaves configuradas (do sistema ou do arquivo .env)
            config = {
                "CODESTRAL_API_KEY": os.environ.get("CODESTRAL_API_KEY") or env_vars.get("CODESTRAL_API_KEY", ""),
                "GEMINI_API_KEY": os.environ.get("GEMINI_API_KEY") or env_vars.get("GEMINI_API_KEY", ""),
                "OPENAI_API_KEY": os.environ.get("OPENAI_API_KEY") or env_vars.get("OPENAI_API_KEY", "")
            }
            self.wfile.write(json.dumps(config).encode('utf-8'))
        else:
            super().do_GET()

    # Desativa cache e adiciona cabeçalhos de controle de acesso para facilitar o desenvolvimento
    def end_headers(self):
        self.send_header('Access-Control-Allow-Origin', '*')
        self.send_header('Cache-Control', 'no-store, no-cache, must-revalidate, max-age=0')
        return super().end_headers()

socketserver.TCPServer.allow_reuse_address = True

print("=" * 66)
print(" 🚀  SERVIDOR LOCAL - AGENTE FINANCEIRO DI  🚀")
print("=" * 66)
print(f" Raiz do Projeto: {project_root}")
print(f" URL de Acesso:   http://localhost:{PORT}/src/index.html")
print("=" * 66)
print(" Servidor rodando... Pressione Ctrl+C para encerrar.")
print("=" * 66)

try:
    # Abre o navegador automaticamente na página correta do app
    webbrowser.open(f"http://localhost:{PORT}/src/index.html")
    
    with socketserver.TCPServer(("", PORT), MyHandler) as httpd:
        httpd.serve_forever()
except KeyboardInterrupt:
    print("\n[!] Servidor encerrado com sucesso pelo usuário.")
    sys.exit(0)
except Exception as e:
    print(f"\n[X] Erro ao iniciar o servidor: {e}")
    sys.exit(1)
