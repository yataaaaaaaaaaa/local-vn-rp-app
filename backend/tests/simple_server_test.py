from __future__ import annotations

from pathlib import Path
import sys
import unittest

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from local_vn_rp_backend.simple_server import BackendHttpServer, ServerSentEvent


class SimpleServerSseTest(unittest.TestCase):
    def test_sse_comment_encoding_is_browser_compatible(self) -> None:
        self.assertEqual(ServerSentEvent(comment="connected").encode(), b": connected\n\n")

    def test_sse_payload_encoding_uses_default_message_event(self) -> None:
        payload = {"type": "generation_progress", "job_id": "job_1", "progress": 0.5, "step": 1, "total_steps": 2}
        self.assertEqual(
            ServerSentEvent(data=payload).encode(),
            b'data: {"type":"generation_progress","job_id":"job_1","progress":0.5,"step":1,"total_steps":2}\n\n',
        )

    def test_stdlib_server_uses_daemon_request_threads_for_long_lived_sse(self) -> None:
        self.assertTrue(BackendHttpServer.daemon_threads)
        self.assertFalse(BackendHttpServer.block_on_close)


if __name__ == "__main__":
    unittest.main()
