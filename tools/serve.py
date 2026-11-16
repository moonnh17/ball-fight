# 로컬 테스트 서버: python tools/serve.py [포트]
# 파이썬 기본 서버는 캐시 규칙을 안 보내서 브라우저가 옛 코드를 계속 씀 → 배포(_headers)처럼 코드는 매번 새로 확인
import sys, http.server, functools, os

class NoCache(http.server.SimpleHTTPRequestHandler):
    def end_headers(self):
        self.send_header('Cache-Control', 'no-cache')
        super().end_headers()

root = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..')
port = int(sys.argv[1]) if len(sys.argv) > 1 else 8765
http.server.ThreadingHTTPServer(('', port), functools.partial(NoCache, directory=root)).serve_forever()
